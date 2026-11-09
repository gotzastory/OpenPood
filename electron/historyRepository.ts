import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

export const HISTORY_FILE_MAGIC = Buffer.from('OPENPOOD-HISTORY-1\n', 'utf8');
const UNREADABLE_HISTORY = 'อ่านประวัติที่เข้ารหัสไว้ไม่สำเร็จ จึงไม่เขียนทับไฟล์';

export class HistoryEncryptionUnavailable extends Error {
  constructor() {
    super('ระบบเข้ารหัสประวัติยังไม่พร้อม จึงไม่บันทึกประวัติลงดิสก์');
    this.name = 'HistoryEncryptionUnavailable';
  }
}

export interface HistoryCodec {
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
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

function entriesFromUnknown(value: unknown): HistoryEntry[] {
  return bounded(Array.isArray(value) ? value.filter(validEntry) : []);
}

interface LoadedHistory {
  entries: HistoryEntry[];
  migrate: boolean;
  unreadable: boolean;
}

function loadFile(filePath: string, codec: HistoryCodec): LoadedHistory {
  let raw: Buffer;
  try { raw = readFileSync(filePath); }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // A missing file or a path that is not a file is not sealed ciphertext.
    if (code === 'ENOENT' || code === 'EISDIR') return { entries: [], migrate: false, unreadable: false };
    return { entries: [], migrate: false, unreadable: true };
  }
  if (raw.length === 0) return { entries: [], migrate: false, unreadable: false };
  if (raw.subarray(0, HISTORY_FILE_MAGIC.length).equals(HISTORY_FILE_MAGIC)) {
    try {
      const parsed = JSON.parse(codec.decrypt(raw.subarray(HISTORY_FILE_MAGIC.length))) as { entries?: unknown };
      return { entries: entriesFromUnknown(parsed.entries), migrate: false, unreadable: false };
    } catch {
      return { entries: [], migrate: false, unreadable: true };
    }
  }
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as { entries?: unknown };
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      return { entries: [], migrate: false, unreadable: true };
    }
    return { entries: entriesFromUnknown(parsed.entries), migrate: true, unreadable: false };
  } catch {
    return { entries: [], migrate: false, unreadable: true };
  }
}

// Memory reads, serialized asynchronous writes, and atomic replace of history.json.
// The file body is safeStorage ciphertext. Plaintext {entries} is migrated once
// encryption works. Commit memory only after an encrypted write succeeds.
export class HistoryRepository {
  private entries: HistoryEntry[];
  private writes: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly codec: HistoryCodec;
  private readonly onEncryptionUnavailable?: () => void;
  private readonly onUnreadable?: () => void;
  private unreadable: boolean;

  constructor(filePath: string, codec: HistoryCodec, options?: { onEncryptionUnavailable?: () => void; onUnreadable?: () => void }) {
    this.filePath = filePath;
    this.codec = codec;
    this.onEncryptionUnavailable = options?.onEncryptionUnavailable;
    this.onUnreadable = options?.onUnreadable;
    const loaded = loadFile(filePath, codec);
    this.entries = loaded.entries;
    this.unreadable = loaded.unreadable;
    if (loaded.unreadable) this.onUnreadable?.();
    if (loaded.migrate) {
      this.writes = this.persist(this.entries).catch((err: unknown) => {
        if (err instanceof HistoryEncryptionUnavailable) this.onEncryptionUnavailable?.();
      });
    }
  }

  list(): HistoryEntry[] { return this.entries.map((entry) => ({ ...entry })); }

  private encode(next: HistoryEntry[]): Buffer {
    try {
      return Buffer.concat([HISTORY_FILE_MAGIC, this.codec.encrypt(JSON.stringify({ entries: next }))]);
    } catch (err) {
      if (err instanceof HistoryEncryptionUnavailable) throw err;
      throw new HistoryEncryptionUnavailable();
    }
  }

  private async persist(next: HistoryEntry[]): Promise<void> {
    const payload = this.encode(next);
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, payload, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private enqueue(change: (current: HistoryEntry[]) => HistoryEntry[], preserveOnFailure = false): Promise<void> {
    const operation = this.writes.then(async () => {
      if (this.unreadable) throw new Error(UNREADABLE_HISTORY);
      const next = bounded(change(this.entries));
      try {
        await this.persist(next);
        this.entries = next;
      } catch (err) {
        if (err instanceof HistoryEncryptionUnavailable) {
          this.onEncryptionUnavailable?.();
          throw err;
        }
        if (preserveOnFailure) this.entries = next;
        throw new Error('บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบพื้นที่และสิทธิ์เขียนไฟล์');
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

  clear(): Promise<void> {
    const operation = this.writes.then(async () => {
      if (this.unreadable) {
        await rm(this.filePath, { force: true });
        this.entries = [];
        this.unreadable = false;
        return;
      }
      try {
        await this.persist([]);
        this.entries = [];
      } catch (err) {
        if (err instanceof HistoryEncryptionUnavailable) {
          await rm(this.filePath, { force: true });
          this.entries = [];
          this.onEncryptionUnavailable?.();
          return;
        }
        throw new Error('บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบพื้นที่และสิทธิ์เขียนไฟล์');
      }
    });
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  flush(): Promise<void> { return this.writes; }
}
