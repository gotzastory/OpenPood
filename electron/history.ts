import Store from 'electron-store';

export interface HistoryEntry {
  id: string;
  text: string;
  timestamp: number;
  durationMs: number;
  wordCount: number;
}

interface HistorySchema {
  entries: HistoryEntry[];
}

const historyStore = new Store<HistorySchema>({
  name: 'history',
  defaults: { entries: [] },
});

const MAX_ENTRIES = 500;

export function addHistoryEntry(text: string, durationMs: number): HistoryEntry {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    timestamp: Date.now(),
    durationMs,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
  };
  const entries = [entry, ...historyStore.get('entries')].slice(0, MAX_ENTRIES);
  historyStore.set('entries', entries);
  return entry;
}

export function listHistory(): HistoryEntry[] {
  return historyStore.get('entries');
}

export function clearHistory(): void {
  historyStore.set('entries', []);
}

export function historyStats() {
  const entries = historyStore.get('entries');
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
