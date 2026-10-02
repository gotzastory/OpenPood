export interface AppSettings {
  apiKey: string;
  /** Always true on reads: the main process redacts apiKey to '' and reports
   * whether one is saved via this flag. Never sent when saving. */
  hasApiKey: boolean;
  apiBaseUrl: string;
  model: string;
  hotkey: string;
  language: string;
  micDeviceId: string;
  launchAtStartup: boolean;
  playSound: boolean;
  maxDurationSec: number;
  onboardingCompleted: boolean;
  stripFillersEnabled: boolean;
  aiPolishEnabled: boolean;
  chatModel: string;
  translateHotkey: string;
  translateTargetLang: string;
}

export type RecordingMode = "dictate" | "translate";

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** false when the foreground window changed mid-request and the text was
   * left on the clipboard instead of pasted. */
  pasted?: boolean;
}

export type WidgetState = "idle" | "recording" | "processing" | "skipped";

export interface HistoryEntry {
  id: string;
  text: string;
  model: string;
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
  onCancelRecording(callback: () => void): () => void;
  setRecordingState(state: WidgetState): void;
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
