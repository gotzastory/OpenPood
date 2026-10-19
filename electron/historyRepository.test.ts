import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HistoryRepository, type HistoryEntry } from './historyRepository';
import { RUNTIME } from '../src/lib/runtimeConfig';

let directory: string;
let file: string;
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'openpood-history-')); file = path.join(directory, 'history.json'); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('asynchronous bounded history', () => {
  it('serializes concurrent add/clear without resurrecting deleted entries', async () => {
    const repository = new HistoryRepository(file, []);
    await Promise.all([repository.add('first', 1000, 'test'), repository.clear(), repository.add('last', 2000, 'test')]);
    expect(repository.list().map((entry) => entry.text)).toEqual(['last']);
    expect(JSON.parse(await readFile(file, 'utf8')).entries.map((entry: HistoryEntry) => entry.text)).toEqual(['last']);
  });
  it('keeps a transcript in memory on disk failure and retries persistence next time', async () => {
    await mkdir(file);
    const repository = new HistoryRepository(file, []);
    await expect(repository.add('recover me', 1000, 'test')).rejects.toThrow('บันทึกประวัติ');
    expect(repository.list()[0].text).toBe('recover me');
    await rm(file, { recursive: true });
    await repository.add('second', 1000, 'test');
    expect(JSON.parse(await readFile(file, 'utf8')).entries).toHaveLength(2);
  });
  it('does not discard memory history when clear fails', async () => {
    const repository = new HistoryRepository(file, []);
    await repository.add('keep me', 1000, 'test');
    await rm(file);
    await mkdir(file);
    await expect(repository.clear()).rejects.toThrow();
    expect(repository.list()[0].text).toBe('keep me');
  });
  it('caps both entry count and serialized bytes without truncating individual text', async () => {
    const entry: HistoryEntry = { id: 'id', text: 'ก'.repeat(30000), model: 'test', timestamp: 1, durationMs: 1000, wordCount: 1 };
    const repository = new HistoryRepository(file, Array.from({ length: 600 }, (_, index) => ({ ...entry, id: String(index) })));
    await repository.add('newest', 1000, 'test');
    expect(repository.list().length).toBeLessThanOrEqual(RUNTIME.maxHistoryEntries);
    expect((await stat(file)).size).toBeLessThanOrEqual(RUNTIME.maxHistoryBytes);
    expect(repository.list()[1].text).toBe(entry.text);
  });
  it('validates migrated entries and prevents callers from mutating cached history', async () => {
    const repository = new HistoryRepository(file, [null, { text: 'broken' }]);
    expect(repository.list()).toEqual([]);
    await repository.add('original', 1000, 'test');
    repository.list()[0].text = 'mutated';
    expect(repository.list()[0].text).toBe('original');
    await expect(repository.add('empty', Number.NaN, 'test')).rejects.toThrow('ไม่ถูกต้อง');
  });
});
