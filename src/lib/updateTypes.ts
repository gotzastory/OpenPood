export type UpdatePhase = 'disabled' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';

/** in-app = electron-updater; browser = open GitHub Releases (unsigned mac / .deb). */
export type UpdateChannel = 'in-app' | 'browser' | 'disabled';

export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
  busy: boolean;
  channel: UpdateChannel;
}
