import Store from 'electron-store';
import { STORE_DIRECTORY } from './storage';
import { HistoryRepository, type HistoryEntry } from './historyRepository';

export type { HistoryEntry } from './historyRepository';

interface HistorySchema {
  entries: HistoryEntry[];
}

const historyStore = new Store<HistorySchema>({
  cwd: STORE_DIRECTORY,
  name: 'history',
  defaults: { entries: [] },
});

const repository = new HistoryRepository(historyStore.path, historyStore.get('entries'));

export function addHistoryEntry(text: string, durationMs: number, model: string): Promise<HistoryEntry> {
  return repository.add(text, durationMs, model);
}

export function listHistory(): HistoryEntry[] {
  return repository.list();
}

export function clearHistory(): Promise<void> {
  return repository.clear();
}

export function flushHistory(): Promise<void> { return repository.flush(); }

export function historyStats() {
  const entries = repository.list();
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
