import type { AppUpdater, UpdateInfo } from 'electron-updater';
import type { UpdateChannel, UpdateStatus } from '../src/lib/updateTypes';
import { releasesDownloadUrl, type UpdateChannel as PlatformUpdateChannel } from './platform';

export const UPDATE_SCHEDULE = { startupDelayMs: 15_000, intervalMs: 6 * 60 * 60 * 1000 };
// Installed v1.0.3 builds still have gotzastory/OpenPud in app-update.yml.
// New builds ask GitHub for this repository directly.
export const UPDATE_FEED = {
  provider: 'github',
  owner: 'gotzastory',
  repo: 'OpenPood',
  releaseType: 'release',
} as const;
type Client = Pick<AppUpdater, 'on' | 'setFeedURL' | 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>;

function notes(info: UpdateInfo): string {
  const value = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : info.releaseNotes?.map((entry) => entry.note ?? '').join('\n') ?? '';
  // Release text is rendered as plain text, never HTML.
  return value.slice(0, 8000);
}

function toStatusChannel(channel: PlatformUpdateChannel): UpdateChannel {
  return channel;
}

export class UpdateController {
  private status: UpdateStatus;
  private operation = false;
  private installing = false;
  private downloaded = false;
  private readonly client: Client;
  private readonly channel: PlatformUpdateChannel;
  private readonly isBusy: () => boolean;
  private readonly publish: (status: UpdateStatus) => void;
  private readonly prepareInstall: () => void;
  private readonly restoreAfterFailure: () => void;
  private readonly openExternal: (url: string) => Promise<void>;

  constructor(
    client: Client,
    currentVersion: string,
    channel: PlatformUpdateChannel,
    isBusy: () => boolean,
    publish: (status: UpdateStatus) => void,
    prepareInstall: () => void,
    restoreAfterFailure: () => void,
    openExternal: (url: string) => Promise<void> = async () => undefined,
  ) {
    this.client = client;
    this.channel = channel;
    this.isBusy = isBusy;
    this.publish = publish;
    this.prepareInstall = prepareInstall;
    this.restoreAfterFailure = restoreAfterFailure;
    this.openExternal = openExternal;
    const statusChannel = toStatusChannel(channel);
    this.status = {
      phase: channel === 'disabled' ? 'disabled' : 'idle',
      currentVersion,
      busy: false,
      channel: statusChannel,
    };
    if (channel === 'in-app') {
      client.setFeedURL(UPDATE_FEED);
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
  }

  getStatus(): UpdateStatus { return { ...this.status, busy: this.isBusy(), channel: toStatusChannel(this.channel) }; }
  refreshBusy(): void { this.publish(this.getStatus()); }
  isInstalling(): boolean { return this.installing; }
  supportsAutoCheck(): boolean { return this.channel === 'in-app'; }

  private set(partial: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...partial, channel: toStatusChannel(this.channel) };
    this.publish(this.getStatus());
  }

  private fail(): void {
    if (this.installing) {
      this.installing = false;
      this.restoreAfterFailure();
    }
    this.set({ phase: this.downloaded ? 'downloaded' : 'error', error: 'อัปเดตไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง' });
  }

  async openReleasesPage(): Promise<UpdateStatus> {
    if (this.channel === 'disabled') return this.getStatus();
    try {
      await this.openExternal(releasesDownloadUrl(UPDATE_FEED.owner, UPDATE_FEED.repo));
    } catch {
      this.set({ error: 'เปิดหน้าดาวน์โหลดไม่สำเร็จ ลองอีกครั้ง' });
    }
    return this.getStatus();
  }

  async check(): Promise<UpdateStatus> {
    if (this.channel === 'browser') return this.openReleasesPage();
    if (this.channel !== 'in-app' || this.operation || this.downloaded || this.installing) return this.getStatus();
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
    if (this.channel === 'browser') return this.openReleasesPage();
    if (this.channel !== 'in-app' || this.operation || this.installing || this.downloaded || !this.status.version) return this.getStatus();
    this.operation = true;
    this.set({ phase: 'downloading', percent: 0, error: undefined });
    try { await this.client.downloadUpdate(); }
    catch { this.fail(); }
    finally { this.operation = false; }
    return this.getStatus();
  }

  install(): UpdateStatus {
    if (this.channel === 'browser') {
      void this.openReleasesPage();
      return this.getStatus();
    }
    if (this.channel !== 'in-app' || !this.downloaded || this.operation || this.installing) return this.getStatus();
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
