import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, RendererSettings } from './config';
import type { HistoryEntry } from './history';
import type { CorrectionRule } from './dictionary';
import type { UpdateStatus } from '../src/lib/updateTypes';

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** false when the foreground window changed mid-request and the text was
   * left on the clipboard instead of pasted. */
  pasted?: boolean;
}

export type WidgetState = 'idle' | 'recording' | 'processing' | 'skipped';

export interface HistoryStats {
  sessions: number;
  totalWords: number;
  totalMinutes: number;
  wpm: number;
}

export type RecordingMode = 'dictate' | 'translate';

const api = {
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:get'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:check'),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:download'),
  installUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => callback(status);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  // Settings coming back over IPC are redacted: apiKey is always '' and
  // hasApiKey says whether one is saved (the real key stays in main).
  getSettings: (): Promise<RendererSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>): Promise<RendererSettings> =>
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
  onCancelRecording: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('hotkey:cancel-recording', listener);
    return () => ipcRenderer.removeListener('hotkey:cancel-recording', listener);
  },
  // Lets main register Escape as a cancel key only while actually recording.
  setRecordingState: (state: WidgetState): void => {
    ipcRenderer.send('recording:state', state);
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
