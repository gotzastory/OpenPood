import type { AppUpdater, UpdateInfo } from 'electron-updater';
import type { UpdateStatus } from '../src/lib/updateTypes';

export const UPDATE_SCHEDULE = { startupDelayMs: 15_000, intervalMs: 6 * 60 * 60 * 1000 };
type Client = Pick<AppUpdater, 'on' | 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>;

function notes(info: UpdateInfo): string {
  const value = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : info.releaseNotes?.map((entry) => entry.note ?? '').join('\n') ?? '';
  // Release text is rendered as plain text, never HTML.
  return value.slice(0, 8000);
}

export class UpdateController {
  private status: UpdateStatus;
  private operation = false;
  private installing = false;
  private downloaded = false;
  private readonly client: Client;
  private readonly enabled: boolean;
  private readonly isBusy: () => boolean;
  private readonly publish: (status: UpdateStatus) => void;
  private readonly prepareInstall: () => void;
  private readonly restoreAfterFailure: () => void;

  constructor(
    client: Client,
    currentVersion: string,
    enabled: boolean,
    isBusy: () => boolean,
    publish: (status: UpdateStatus) => void,
    prepareInstall: () => void,
    restoreAfterFailure: () => void,
  ) {
    this.client = client;
    this.enabled = enabled;
    this.isBusy = isBusy;
    this.publish = publish;
    this.prepareInstall = prepareInstall;
    this.restoreAfterFailure = restoreAfterFailure;
    this.status = { phase: enabled ? 'idle' : 'disabled', currentVersion, busy: false };
    client.autoDownload = false;
    client.autoInstallOnAppQuit = false;
    client.allowPrerelease = false;
    client.allowDowngrade = false;
    client.on('update-available', (info) => this.set({ phase: 'available', version: info.version, releaseNotes: notes(info), error: undefined }));
    client.on('update-not-available', () => this.set({ phase: 'current', version: undefined, releaseNotes: undefined }));
    client.on('download-progress', (progress) => this.set({ phase: 'downloading', percent: Math.max(0, Math.min(100, progress.percent)) }));
    client.on('update-downloaded', (info) => {
      this.downloaded = true;
      this.set({ phase: 'downloaded', version: info.version, releaseNotes: notes(info), percent: 100, error: undefined });
    });
    client.on('error', () => this.fail());
  }

  getStatus(): UpdateStatus { return { ...this.status, busy: this.isBusy() }; }
  refreshBusy(): void { this.publish(this.getStatus()); }
  isInstalling(): boolean { return this.installing; }

  private set(partial: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...partial };
    this.publish(this.getStatus());
  }

  private fail(): void {
    if (this.installing) {
      this.installing = false;
      this.restoreAfterFailure();
    }
    this.set({ phase: this.downloaded ? 'downloaded' : 'error', error: 'อัปเดตไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' });
  }

  async check(): Promise<UpdateStatus> {
    if (!this.enabled || this.operation || this.downloaded || this.installing) return this.getStatus();
    this.operation = true;
    this.set({ phase: 'checking', error: undefined, percent: undefined, version: undefined, releaseNotes: undefined });
    try {
      const result = await this.client.checkForUpdates();
      if (!result) this.fail();
    } catch { this.fail(); }
    finally { this.operation = false; }
    return this.getStatus();
  }

  async download(): Promise<UpdateStatus> {
    if (!this.enabled || this.operation || this.installing || this.downloaded || !this.status.version) return this.getStatus();
    this.operation = true;
    this.set({ phase: 'downloading', percent: 0, error: undefined });
    try { await this.client.downloadUpdate(); }
    catch { this.fail(); }
    finally { this.operation = false; }
    return this.getStatus();
  }

  install(): UpdateStatus {
    if (!this.enabled || !this.downloaded || this.operation || this.installing) return this.getStatus();
    if (this.isBusy()) {
      this.set({ error: 'รอให้การอัดเสียง ถอดเสียง และวางข้อความเสร็จก่อนอัปเดต' });
      return this.getStatus();
    }
    this.installing = true;
    this.set({ phase: 'installing', error: undefined });
    try {
      this.prepareInstall();
      this.client.quitAndInstall(false, true);
    } catch { this.fail(); }
    return this.getStatus();
  }
}
