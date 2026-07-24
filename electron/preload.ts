import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings } from './config';
import type { HistoryEntry } from './history';
import type { CorrectionRule } from './dictionary';

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface HistoryStats {
  sessions: number;
  totalWords: number;
  totalMinutes: number;
  wpm: number;
}

export type RecordingMode = 'dictate' | 'translate';

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', partial),
  openMainWindow: (route = '/'): Promise<void> => ipcRenderer.invoke('app:open-main-window', route),
  runTranscription: (
    buffer: ArrayBuffer,
    mimeType: string,
    durationMs: number,
    mode: RecordingMode = 'dictate',
  ): Promise<TranscribeResult> =>
    ipcRenderer.invoke('transcription:run', { buffer, mimeType, durationMs, mode }),
  onToggleRecording: (callback: (mode: RecordingMode) => void) => {
    const listener = (_e: unknown, mode: RecordingMode) => callback(mode ?? 'dictate');
    ipcRenderer.on('hotkey:toggle-recording', listener);
    return () => ipcRenderer.removeListener('hotkey:toggle-recording', listener);
  },
  onNavigate: (callback: (route: string) => void) => {
    const listener = (_e: unknown, route: string) => callback(route);
    ipcRenderer.on('nav:goto', listener);
    return () => ipcRenderer.removeListener('nav:goto', listener);
  },
  onHistoryUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('history:updated', listener);
    return () => ipcRenderer.removeListener('history:updated', listener);
  },
  listHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
  historyStats: (): Promise<HistoryStats> => ipcRenderer.invoke('history:stats'),
  clearHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:clear'),
  listDictionary: (): Promise<string[]> => ipcRenderer.invoke('dictionary:list'),
  setDictionary: (words: string[]): Promise<string[]> => ipcRenderer.invoke('dictionary:set', words),
  listCorrections: (): Promise<CorrectionRule[]> => ipcRenderer.invoke('corrections:list'),
  setCorrections: (rules: CorrectionRule[]): Promise<CorrectionRule[]> =>
    ipcRenderer.invoke('corrections:set', rules),
};

contextBridge.exposeInMainWorld('typeless', api);

export type TypelessApi = typeof api;
