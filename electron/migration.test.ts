import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEGACY_STORE_FILES, migrateLegacyData } from './migration';

const temporaryDirectories: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'openpood-migration-'));
  temporaryDirectories.push(root);
  const legacy = path.join(root, 'OpenPud');
  const target = path.join(root, 'OpenPood');
  mkdirSync(legacy);
  return { legacy, target };
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('OpenPud upgrade', () => {
  it('copies every store byte-for-byte and retains the encrypted key and originals', () => {
    const { legacy, target } = fixture();
    const contents = ['{"apiKeyEncrypted":"encrypted-test-blob","hotkey":"Control+Space"}',
      '{"entries":[{"text":"สวัสดี"}]}', '{"words":["OpenPood"],"corrections":[]}'];
    LEGACY_STORE_FILES.forEach((file, i) => writeFileSync(path.join(legacy, file), contents[i]));
    expect(migrateLegacyData(legacy, target)).toBe(3);
    LEGACY_STORE_FILES.forEach((file, i) => {
      expect(readFileSync(path.join(target, file), 'utf8')).toBe(contents[i]);
      expect(readFileSync(path.join(legacy, file), 'utf8')).toBe(contents[i]);
    });
    expect(migrateLegacyData(legacy, target)).toBe(0);
  });
  it('preserves existing OpenPood stores', () => {
    const { legacy, target } = fixture();
    mkdirSync(target);
    writeFileSync(path.join(legacy, 'config.json'), '{"hotkey":"Control+Space"}');
    writeFileSync(path.join(target, 'config.json'), '{"hotkey":"Control+Alt+D"}');
    expect(migrateLegacyData(legacy, target)).toBe(0);
    expect(readFileSync(path.join(target, 'config.json'), 'utf8')).toContain('Control+Alt+D');
  });
  it('validates all sources before writing and retains invalid originals', () => {
    const { legacy, target } = fixture();
    writeFileSync(path.join(legacy, 'config.json'), '{}');
    writeFileSync(path.join(legacy, 'history.json'), 'invalid-json');
    expect(() => migrateLegacyData(legacy, target)).toThrow();
    expect(existsSync(path.join(target, 'config.json'))).toBe(false);
    expect(readFileSync(path.join(legacy, 'history.json'), 'utf8')).toBe('invalid-json');
  });
  it('does not resurrect deleted history after a completed migration', () => {
    const { legacy, target } = fixture();
    writeFileSync(path.join(legacy, 'history.json'), '{"entries":[]}');
    migrateLegacyData(legacy, target);
    rmSync(path.join(target, 'history.json'));
    expect(migrateLegacyData(legacy, target)).toBe(0);
    expect(existsSync(path.join(target, 'history.json'))).toBe(false);
  });
  it('leaves a new installation alone', () => {
    const { legacy, target } = fixture();
    expect(migrateLegacyData(legacy, target)).toBe(0);
    expect(existsSync(target)).toBe(false);
  });
  it('rolls back newly copied stores when committing the marker fails', () => {
    const { legacy, target } = fixture();
    mkdirSync(target);
    writeFileSync(path.join(legacy, 'config.json'), '{}');
    writeFileSync(path.join(legacy, 'history.json'), '{"entries":[]}');
    writeFileSync(path.join(target, 'dictionary.json'), '{"words":["existing"]}');
    writeFileSync(path.join(target, '.openpood-migration-v1.tmp'), 'interrupted');
    expect(() => migrateLegacyData(legacy, target)).toThrow();
    expect(existsSync(path.join(target, 'config.json'))).toBe(false);
    expect(existsSync(path.join(target, 'history.json'))).toBe(false);
    expect(readFileSync(path.join(target, 'dictionary.json'), 'utf8')).toContain('existing');
    expect(readFileSync(path.join(legacy, 'history.json'), 'utf8')).toBe('{"entries":[]}');
    expect(migrateLegacyData(legacy, target)).toBe(2);
  });
});
