import path from 'node:path';
import { Notification, safeStorage } from 'electron';
import { STORE_DIRECTORY } from './storage';
import { HistoryEncryptionUnavailable, HistoryRepository, type HistoryCodec, type HistoryEntry } from './historyRepository';

export type { HistoryEntry } from './historyRepository';
export { HistoryEncryptionUnavailable } from './historyRepository';

const historyPath = path.join(STORE_DIRECTORY, 'history.json');

function historyCodec(): HistoryCodec {
  return {
    encrypt(plaintext: string): Buffer {
      if (!safeStorage.isEncryptionAvailable()) throw new HistoryEncryptionUnavailable();
      try { return safeStorage.encryptString(plaintext); }
      catch { throw new HistoryEncryptionUnavailable(); }
    },
    decrypt(ciphertext: Buffer): string {
      if (!safeStorage.isEncryptionAvailable()) throw new HistoryEncryptionUnavailable();
      return safeStorage.decryptString(ciphertext);
    },
  };
}

let repository: HistoryRepository | undefined;
const warned = new Set<string>();

function warnOnce(body: string): void {
  if (warned.has(body)) return;
  warned.add(body);
  try {
    if (Notification.isSupported()) new Notification({ title: 'บันทึกประวัติไม่ได้', body }).show();
    else console.warn(body);
  } catch {
    console.warn(body);
  }
}

function repo(): HistoryRepository {
  repository ??= new HistoryRepository(historyPath, historyCodec(), {
    onEncryptionUnavailable: () => warnOnce('ระบบเข้ารหัสประวัติยังไม่พร้อม จึงไม่บันทึกประวัติใหม่ลงดิสก์'),
    onUnreadable: () => warnOnce('อ่านประวัติที่เข้ารหัสไว้ไม่สำเร็จ จึงไม่แสดงและไม่เขียนทับไฟล์'),
  });
  return repository;
}

export function warmHistory(): void {
  repo();
}

export function addHistoryEntry(text: string, durationMs: number, model: string): Promise<HistoryEntry> {
  return repo().add(text, durationMs, model);
}

export function listHistory(): HistoryEntry[] {
  return repo().list();
}

export function clearHistory(): Promise<void> {
  return repo().clear();
}

export function flushHistory(): Promise<void> { return repo().flush(); }

export function historyStats() {
  const entries = repo().list();
  const totalWords = entries.reduce((sum, e) => sum + e.wordCount, 0);
  const totalMs = entries.reduce((sum, e) => sum + e.durationMs, 0);
  const totalMinutes = totalMs / 60000;
  const wpm = totalMinutes > 0 ? Math.round(totalWords / totalMinutes) : 0;
  return {
    sessions: entries.length,
    totalWords,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    wpm,
  };
}
