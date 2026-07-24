export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  hotkey: string;
  language: string;
  micDeviceId: string;
  launchAtStartup: boolean;
  playSound: boolean;
  maxDurationSec: number;
  onboardingCompleted: boolean;
  aiPolishEnabled: boolean;
  chatModel: string;
  translateHotkey: string;
  askHotkey: string;
  translateTargetLang: string;
}

export type RecordingMode = "dictate" | "translate" | "ask";

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  text: string;
  timestamp: number;
  durationMs: number;
  wordCount: number;
}

export interface HistoryStats {
  sessions: number;
  totalWords: number;
  totalMinutes: number;
  wpm: number;
}

export interface CorrectionRule {
  from: string;
  to: string;
}

interface TypelessApi {
  getSettings(): Promise<AppSettings>;
  setSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
  openMainWindow(route?: string): Promise<void>;
  runTranscription(
    buffer: ArrayBuffer,
    mimeType: string,
    durationMs: number,
    mode?: RecordingMode,
  ): Promise<TranscribeResult>;
  onToggleRecording(callback: (mode: RecordingMode) => void): () => void;
  onNavigate(callback: (route: string) => void): () => void;
  onHistoryUpdated(callback: () => void): () => void;
  listHistory(): Promise<HistoryEntry[]>;
  historyStats(): Promise<HistoryStats>;
  clearHistory(): Promise<HistoryEntry[]>;
  listDictionary(): Promise<string[]>;
  setDictionary(words: string[]): Promise<string[]>;
  listCorrections(): Promise<CorrectionRule[]>;
  setCorrections(rules: CorrectionRule[]): Promise<CorrectionRule[]>;
}

declare global {
  interface Window {
    typeless: TypelessApi;
  }
}
