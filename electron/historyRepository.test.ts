import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_FILE_MAGIC, HistoryEncryptionUnavailable, HistoryRepository, type HistoryCodec, type HistoryEntry } from './historyRepository';
import { RUNTIME } from '../src/lib/runtimeConfig';

const codec: HistoryCodec = {
  encrypt: (plaintext) => Buffer.from(Buffer.from(plaintext, 'utf8').toString('base64'), 'utf8'),
  decrypt: (ciphertext) => Buffer.from(ciphertext.toString('utf8'), 'base64').toString('utf8'),
};

let directory: string;
let file: string;
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'openpood-history-')); file = path.join(directory, 'history.json'); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function storedEntries(target = file): Promise<HistoryEntry[]> {
  const raw = await readFile(target);
  expect(raw.subarray(0, HISTORY_FILE_MAGIC.length).equals(HISTORY_FILE_MAGIC)).toBe(true);
  const body = raw.subarray(HISTORY_FILE_MAGIC.length);
  return JSON.parse(codec.decrypt(body)).entries as HistoryEntry[];
}

describe('asynchronous bounded history', () => {
  it('serializes concurrent add/clear without resurrecting deleted entries', async () => {
    const repository = new HistoryRepository(file, codec);
    await Promise.all([repository.add('first', 1000, 'test'), repository.clear(), repository.add('last', 2000, 'test')]);
    expect(repository.list().map((entry) => entry.text)).toEqual(['last']);
    expect((await storedEntries()).map((entry) => entry.text)).toEqual(['last']);
  });
  it('keeps a transcript in memory on disk failure and retries persistence next time', async () => {
    await mkdir(file);
    const repository = new HistoryRepository(file, codec);
    await expect(repository.add('recover me', 1000, 'test')).rejects.toThrow('บันทึกประวัติ');
    expect(repository.list()[0].text).toBe('recover me');
    await rm(file, { recursive: true });
    await repository.add('second', 1000, 'test');
    expect(await storedEntries()).toHaveLength(2);
  });
  it('does not discard memory history when clear fails', async () => {
    const repository = new HistoryRepository(file, codec);
    await repository.add('keep me', 1000, 'test');
    await rm(file);
    await mkdir(file);
    await expect(repository.clear()).rejects.toThrow();
    expect(repository.list()[0].text).toBe('keep me');
  });
  it('caps both entry count and serialized bytes without truncating individual text', async () => {
    const entry: HistoryEntry = { id: 'id', text: 'ก'.repeat(30000), model: 'test', timestamp: 1, durationMs: 1000, wordCount: 1 };
    await writeFile(file, JSON.stringify({ entries: Array.from({ length: 600 }, (_, index) => ({ ...entry, id: String(index) })) }));
    const repository = new HistoryRepository(file, codec);
    await repository.flush();
    await repository.add('newest', 1000, 'test');
    expect(repository.list().length).toBeLessThanOrEqual(RUNTIME.maxHistoryEntries);
    const payload = JSON.stringify({ entries: await storedEntries() });
    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(RUNTIME.maxHistoryBytes);
    expect(repository.list()[1].text).toBe(entry.text);
  });
  it('validates migrated entries and prevents callers from mutating cached history', async () => {
    await writeFile(file, JSON.stringify({ entries: [null, { text: 'broken' }] }));
    const repository = new HistoryRepository(file, codec);
    await repository.flush();
    expect(repository.list()).toEqual([]);
    await repository.add('original', 1000, 'test');
    repository.list()[0].text = 'mutated';
    expect(repository.list()[0].text).toBe('original');
    await expect(repository.add('empty', Number.NaN, 'test')).rejects.toThrow('ไม่ถูกต้อง');
  });
  it('encrypts history and migrates an existing plaintext file without leaving the transcript in the clear', async () => {
    await writeFile(file, JSON.stringify({ entries: [{ id: '1', text: 'secret transcript', model: 'test', timestamp: 1, durationMs: 1000, wordCount: 2 }] }));
    const repository = new HistoryRepository(file, codec);
    await repository.flush();
    const raw = await readFile(file);
    expect(raw.includes(Buffer.from('secret transcript'))).toBe(false);
    expect(raw.includes(Buffer.from('"entries"'))).toBe(false);
    expect(repository.list()[0].text).toBe('secret transcript');
    expect((await storedEntries())[0].text).toBe('secret transcript');
  });
  it('does not replace plaintext when encryption is unavailable', async () => {
    const plaintext = JSON.stringify({ entries: [{ id: '1', text: 'keep plaintext', model: 'test', timestamp: 1, durationMs: 1000, wordCount: 2 }] });
    await writeFile(file, plaintext);
    let warnings = 0;
    const unavailable: HistoryCodec = {
      encrypt() { throw new HistoryEncryptionUnavailable(); },
      decrypt: codec.decrypt,
    };
    const repository = new HistoryRepository(file, unavailable, { onEncryptionUnavailable: () => { warnings += 1; } });
    await repository.flush();
    expect(await readFile(file, 'utf8')).toBe(plaintext);
    expect(repository.list()[0].text).toBe('keep plaintext');
    await expect(repository.add('new secret', 1000, 'test')).rejects.toBeInstanceOf(HistoryEncryptionUnavailable);
    expect(await readFile(file, 'utf8')).toBe(plaintext);
    expect(repository.list().map((entry) => entry.text)).toEqual(['keep plaintext']);
    expect(warnings).toBeGreaterThan(0);
  });
  it('does not overwrite ciphertext it cannot read, and clear deletes it', async () => {
    const sealed = Buffer.concat([HISTORY_FILE_MAGIC, Buffer.from('not-ciphertext')]);
    await writeFile(file, sealed);
    let unreadable = 0;
    const failing: HistoryCodec = { encrypt: codec.encrypt, decrypt() { throw new Error('wrong machine'); } };
    const repository = new HistoryRepository(file, failing, { onUnreadable: () => { unreadable += 1; } });
    expect(repository.list()).toEqual([]);
    expect(unreadable).toBe(1);
    await expect(repository.add('nope', 1000, 'test')).rejects.toThrow('อ่านประวัติ');
    expect(await readFile(file)).toEqual(sealed);
    await repository.clear();
    await expect(readFile(file)).rejects.toThrow();
    expect(repository.list()).toEqual([]);
  });
});
