import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { RUNTIME } from '../src/lib/runtimeConfig';

export interface HistoryEntry {
  id: string;
  text: string;
  model: string;
  timestamp: number;
  durationMs: number;
  wordCount: number;
}

function validEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as HistoryEntry;
  return typeof entry.id === 'string' && typeof entry.text === 'string' && !!entry.text.trim()
    && entry.text.length <= RUNTIME.maxTextChars && typeof entry.model === 'string'
    && Number.isFinite(entry.timestamp) && Number.isFinite(entry.durationMs) && entry.durationMs >= 0
    && Number.isFinite(entry.wordCount) && entry.wordCount >= 0;
}

function bounded(entries: HistoryEntry[]): HistoryEntry[] {
  let bytes = Buffer.byteLength('{"entries":[]}');
  const kept: HistoryEntry[] = [];
  for (const entry of entries) {
    const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (kept.length >= RUNTIME.maxHistoryEntries || bytes + size > RUNTIME.maxHistoryBytes) break;
    kept.push(entry);
    bytes += size;
  }
  return kept;
}

// Memory reads, serialized asynchronous writes, and atomic replace of the same
// migrated history.json. Commit memory only after persistence succeeds.
export class HistoryRepository {
  private entries: HistoryEntry[];
  private writes: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath: string, initial: unknown) {
    this.filePath = filePath;
    this.entries = bounded(Array.isArray(initial) ? initial.filter(validEntry) : []);
  }

  list(): HistoryEntry[] { return this.entries.map((entry) => ({ ...entry })); }

  private enqueue(change: (current: HistoryEntry[]) => HistoryEntry[], preserveOnFailure = false): Promise<void> {
    const operation = this.writes.then(async () => {
      const next = bounded(change(this.entries));
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ entries: next }), { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.filePath);
        this.entries = next;
      } catch {
        if (preserveOnFailure) this.entries = next;
        throw new Error('บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบพื้นที่และสิทธิ์เขียนไฟล์');
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    });
    // A failed write must not poison subsequent clear/add attempts.
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  async add(text: string, durationMs: number, model: string): Promise<HistoryEntry> {
    const entry = {
      id: randomUUID(), text, model, timestamp: Date.now(), durationMs,
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    };
    if (!validEntry(entry)) throw new Error('ข้อมูลประวัติไม่ถูกต้อง');
    await this.enqueue((current) => [entry, ...current], true);
    return entry;
  }

  clear(): Promise<void> { return this.enqueue(() => []); }
  flush(): Promise<void> { return this.writes; }
}
