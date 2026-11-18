import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEmitter } from 'node:events';
import { RUNTIME } from '../src/lib/runtimeConfig';

type TestWindow = EventEmitter & {
  options?: { webPreferences?: { preload?: string; sandbox?: boolean; contextIsolation?: boolean; nodeIntegration?: boolean } };
  webContents: EventEmitter & { send: ReturnType<typeof vi.fn>; setWindowOpenHandler: ReturnType<typeof vi.fn>; getURL: ReturnType<typeof vi.fn> };
  destroy: () => void;
  loadURL: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  setShape: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  getNativeWindowHandle: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
  reload: ReturnType<typeof vi.fn>;
};
const mocks = vi.hoisted(() => ({
  windows: [] as TestWindow[], handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(), appEvents: new Map<string, (...args: any[]) => any>(),
  shortcuts: new Map<string, () => void>(),
  permissionRequest: undefined as ((webContents: object, permission: string, callback: (granted: boolean) => void) => void) | undefined,
  permissionCheck: undefined as ((webContents: object | null, permission: string) => boolean) | undefined,
  settings: { apiKey: 'test-key', model: 'test-model', hotkey: 'Control+Space', translateHotkey: 'Control+Alt+T',
    launchAtStartup: false, onboardingCompleted: true, stripFillersEnabled: false, aiPolishEnabled: false,
    apiBaseUrl: 'https://provider.test', saveHistory: true },
  foreground: vi.fn(), transcribe: vi.fn(), paste: vi.fn(), addHistory: vi.fn(), setSettings: vi.fn(),
  quit: vi.fn(),
  notifications: [] as { title: string; body: string; show: ReturnType<typeof vi.fn> }[],
  platform: { isWindows: true, isMac: false, isLinux: false },
  closeHintShown: false,
  xWindowMapped: true as boolean | null,
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class BrowserWindow extends EventEmitter {
    static getAllWindows() { return mocks.windows; }
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), setWindowOpenHandler: vi.fn(), getURL: vi.fn(() => 'file:///app/index.html#/'), isDestroyed: () => this.destroyed });
    private destroyed = false;
    options?: TestWindow['options'];
    constructor(options?: TestWindow['options']) { super(); this.options = options; mocks.windows.push(this as unknown as TestWindow); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {} setPosition() {}
    focus = vi.fn();
    setShape = vi.fn();
    getBounds = vi.fn(() => ({ x: 0, y: 0, width: 320, height: 90 }));
    getNativeWindowHandle = vi.fn(() => {
      const buf = Buffer.alloc(8);
      buf.writeUInt32LE(0x1111, 0);
      return buf;
    });
    loadURL = vi.fn(() => Promise.resolve());
    isMinimized = vi.fn(() => false); restore = vi.fn(); show = vi.fn(); minimize = vi.fn();
    isVisible = vi.fn(() => !this.destroyed);
    reload = vi.fn();
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} destroy() {} }
  class Notification {
    static isSupported() { return true; }
    title: string;
    body: string;
    show = vi.fn();
    constructor(options: { title: string; body: string }) {
      this.title = options.title;
      this.body = options.body;
      mocks.notifications.push(this);
    }
  }
  return {
    BrowserWindow, Tray, Notification,
    app: {
      setAppUserModelId: vi.fn(), whenReady: () => Promise.resolve(), isPackaged: false,
      getVersion: () => 'test-version', quit: (...args: unknown[]) => mocks.quit(...args), getAppMetrics: () => [],
      getPath: () => '/tmp/openpood-test',
      commandLine: { getSwitchValue: () => '' },
      on: (event: string, callback: (...args: any[]) => any) => mocks.appEvents.set(event, callback),
    },
    ipcMain: {
      handle: (event: string, callback: (...args: any[]) => any) => mocks.handlers.set(event, callback),
      on: (event: string, callback: (...args: any[]) => any) => mocks.listeners.set(event, callback),
    },
    globalShortcut: {
      unregisterAll: () => mocks.shortcuts.clear(),
      register: (key: string, callback: () => void) => { if (mocks.shortcuts.has(key)) return false; mocks.shortcuts.set(key, callback); return true; },
      unregister: (key: string) => mocks.shortcuts.delete(key), isRegistered: (key: string) => mocks.shortcuts.has(key),
    },
    dialog: { showErrorBox: vi.fn() }, Menu: { buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })) },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize: () => ({}) }) },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), on: vi.fn() },
    session: { defaultSession: {
      setPermissionRequestHandler: (handler: typeof mocks.permissionRequest) => { mocks.permissionRequest = handler; },
      setPermissionCheckHandler: (handler: typeof mocks.permissionCheck) => { mocks.permissionCheck = handler; },
    } },
    shell: { openExternal: vi.fn(async () => undefined) },
    systemPreferences: {
      askForMediaAccess: vi.fn(async () => true),
      getMediaAccessStatus: vi.fn(() => 'granted'),
      isTrustedAccessibilityClient: vi.fn(() => true),
    },
  };
});
vi.mock('electron-updater', () => ({ default: { autoUpdater: { on: vi.fn(), setFeedURL: vi.fn() } } }));
vi.mock('./config', () => ({
  getSettings: () => mocks.settings,
  getRendererSettings: () => ({ ...mocks.settings, apiKey: '', hasApiKey: true }),
  setSettings: mocks.setSettings.mockImplementation((partial: Partial<typeof mocks.settings>) => ({ ...mocks.settings, ...partial })),
}));
vi.mock('./transcribe', () => ({ transcribeAudio: mocks.transcribe, normalizeThaiSpacing: (text: string) => text, TranscriptionError: class extends Error {} }));
vi.mock('./winHost', () => ({ getForegroundWindow: mocks.foreground, warmWinHost: vi.fn(), disposeWinHost: vi.fn() }));
vi.mock('./pasteText', () => ({ pasteAtCursor: mocks.paste }));
vi.mock('./history', () => ({ addHistoryEntry: mocks.addHistory, listHistory: () => [], clearHistory: vi.fn(), historyStats: () => ({}), flushHistory: vi.fn().mockResolvedValue(undefined), warmHistory: vi.fn() }));
vi.mock('./appProfiles', () => ({ listAppProfiles: () => [], setAppProfiles: vi.fn() }));
vi.mock('./dictionary', () => ({ dictionaryPrompt: () => '', applyCorrections: (text: string) => text,
  listDictionaryWords: () => [], setDictionaryWords: vi.fn(), listCorrections: () => [], setCorrections: vi.fn() }));
vi.mock('./platform', () => ({
  isWindows: () => mocks.platform.isWindows,
  isMac: () => mocks.platform.isMac,
  isLinux: () => mocks.platform.isLinux,
  isWayland: () => false,
  resolveUpdateChannel: () => 'disabled',
  hotkeyFailureMessage: () => ({ title: 'ปุ่มลัดใช้งานไม่ได้', body: 'ปุ่มลัดอาจถูกแอปอื่นใช้อยู่ กรุณาเลือกปุ่มลัดใหม่ใน Settings' }),
  pasteFallbackMessage: () => ({ title: 'วางข้อความไม่สำเร็จ', body: 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง' }),
  releasesDownloadUrl: () => 'https://github.com/gotzastory/OpenPood/releases/latest',
}));
vi.mock('./permissions', () => ({
  requestMacPermissions: vi.fn(async () => ({ microphone: 'unsupported', accessibility: 'unsupported' })),
  notifyMissingMacPermissions: vi.fn(),
}));
vi.mock('./lifecyclePrefs', () => ({
  isDashboardCloseHintShown: () => mocks.closeHintShown,
  markDashboardCloseHintShown: () => { mocks.closeHintShown = true; },
  resetDashboardCloseHintForTests: () => { mocks.closeHintShown = false; },
}));
vi.mock('./windowLifecycle', async () => {
  const actual = await vi.importActual<typeof import('./windowLifecycle')>('./windowLifecycle');
  return {
    ...actual,
    // Keep dbus out of unit tests; Linux no-tray shell is driven by platform mocks.
    linuxStatusNotifierPresent: () => false,
  };
});
vi.mock('./linuxNoTray', async () => {
  const actual = await vi.importActual<typeof import('./linuxNoTray')>('./linuxNoTray');
  return {
    ...actual,
    resolveElectronOzonePlatform: () => (mocks.platform.isLinux ? 'x11' : 'unknown'),
    linuxXWindowMapped: () => mocks.xWindowMapped,
  };
});

const payload = () => ({ buffer: new ArrayBuffer(10), mimeType: 'audio/webm', durationMs: 1000 });
function state(value: string, win = mocks.windows[0]) { mocks.listeners.get('recording:state')?.({ sender: win.webContents }, value); }
function startHotkey() { mocks.shortcuts.get('Control+Space')?.(); }
function run() { return mocks.handlers.get('transcription:run')!({ sender: mocks.windows[0].webContents }, payload()); }

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.windows.length = 0; mocks.handlers.clear(); mocks.listeners.clear(); mocks.appEvents.clear(); mocks.shortcuts.clear();
  mocks.notifications.length = 0;
  mocks.closeHintShown = false;
  mocks.xWindowMapped = true;
  mocks.platform.isWindows = true;
  mocks.platform.isMac = false;
  mocks.platform.isLinux = false;
  mocks.settings.saveHistory = true;
  mocks.foreground.mockResolvedValue({ hwnd: '123', processName: 'test' });
  mocks.transcribe.mockResolvedValue('transcript'); mocks.paste.mockResolvedValue({ pasted: true }); mocks.addHistory.mockResolvedValue({});
  await import('./main');
  await Promise.resolve();
  state('idle');
});
afterEach(() => { mocks.appEvents.get('will-quit')?.(); vi.useRealTimers(); });

describe('main dictation integration', () => {
  it('sandboxes both windows and allows microphone permission only for the widget', async () => {
    expect(mocks.windows[0].options?.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect(mocks.windows[0].options?.webPreferences?.preload).toMatch(/preload\.cjs$/);
    const grant = vi.fn();
    mocks.permissionRequest!(mocks.windows[0].webContents, 'media', grant);
    expect(grant).toHaveBeenCalledWith(true);
    grant.mockClear();
    mocks.permissionRequest!(mocks.windows[0].webContents, 'geolocation', grant);
    expect(grant).toHaveBeenCalledWith(false);
    expect(mocks.permissionCheck!(null, 'media')).toBe(false);
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows[1].options?.webPreferences?.sandbox).toBe(true);
    grant.mockClear();
    mocks.permissionRequest!(mocks.windows[1].webContents, 'media', grant);
    expect(grant).toHaveBeenCalledWith(false);
    const navigation = { preventDefault: vi.fn() };
    mocks.windows[0].webContents.emit('will-navigate', navigation, 'https://example.com/phish');
    expect(navigation.preventDefault).toHaveBeenCalledOnce();
  });
  it('skips history when saving is turned off and still pastes', async () => {
    mocks.settings.saveHistory = false;
    startHotkey(); state('processing');
    expect(await run()).toMatchObject({ ok: true, pasted: true });
    expect(mocks.addHistory).not.toHaveBeenCalled();
    expect(mocks.paste).toHaveBeenCalledOnce();
  });
  it('loads the dashboard when tray navigation leaves onboarding and restores the window', async () => {
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const main = mocks.windows[1];
    main.webContents.getURL.mockReturnValue('file:///app/index.html#/onboarding');
    main.isMinimized.mockReturnValue(true);
    await mocks.handlers.get('app:open-main-window')!({ sender: main.webContents }, '/settings');
    expect(main.loadURL).toHaveBeenLastCalledWith(expect.stringContaining('#/settings'));
    expect(main.reload).toHaveBeenCalledOnce();
    expect(main.restore).toHaveBeenCalledOnce();
    expect(main.show).toHaveBeenCalled();
    expect(main.webContents.send).not.toHaveBeenCalledWith('nav:goto', '/settings');
  });
  it('applies widget setShape only for Linux no-tray and ignores non-widget senders', async () => {
    mocks.platform.isWindows = false;
    mocks.platform.isLinux = true;
    vi.resetModules();
    mocks.windows.length = 0; mocks.handlers.clear(); mocks.listeners.clear(); mocks.appEvents.clear(); mocks.shortcuts.clear();
    await import('./main');
    await Promise.resolve();
    const widget = mocks.windows[0];
    const main = mocks.windows[1];
    widget.setShape.mockClear();
    mocks.listeners.get('widget:hit-region')?.({ sender: widget.webContents }, { x: 12, y: 40, width: 180, height: 44 });
    expect(widget.setShape).toHaveBeenCalledWith([{ x: 12, y: 40, width: 180, height: 44 }]);
    widget.setShape.mockClear();
    mocks.listeners.get('widget:hit-region')?.({ sender: main.webContents }, { x: 1, y: 1, width: 10, height: 10 });
    expect(widget.setShape).not.toHaveBeenCalled();
  });
  it('does not call setShape on win32 even if a hit-region event arrives', async () => {
    const widget = mocks.windows[0];
    // Cold start with tray: only the widget window exists until second-instance.
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    widget.setShape.mockClear();
    mocks.listeners.get('widget:hit-region')?.({ sender: widget.webContents }, { x: 12, y: 40, width: 180, height: 44 });
    expect(widget.setShape).not.toHaveBeenCalled();
  });
  it('recreates exactly once when Linux no-tray main window is an X-unmapped zombie', async () => {
    mocks.platform.isWindows = false;
    mocks.platform.isLinux = true;
    mocks.xWindowMapped = false;
    vi.resetModules();
    mocks.windows.length = 0; mocks.handlers.clear(); mocks.listeners.clear(); mocks.appEvents.clear(); mocks.shortcuts.clear();
    await import('./main');
    await Promise.resolve();
    const zombie = mocks.windows[1];
    const before = mocks.windows.length;
    mocks.xWindowMapped = false;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows.length).toBe(before + 1);
    const recreated = mocks.windows[before];
    expect(zombie.isDestroyed()).toBe(true);
    expect(recreated.isDestroyed()).toBe(false);
    expect(recreated.show).toHaveBeenCalled();
    expect(recreated.focus).toHaveBeenCalled();
    // Second hammered relaunch while ensuring uses the same guard / live window.
    mocks.xWindowMapped = true;
    const mid = mocks.windows.length;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows.length).toBe(mid);
    expect(recreated.focus).toHaveBeenCalled();
  });
  it('quit IPC sets quitting and calls app.quit', async () => {
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const main = mocks.windows[1];
    await mocks.handlers.get('app:quit')!({ sender: main.webContents });
    expect(mocks.quit).toHaveBeenCalled();
    const before = mocks.windows.length;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows.length).toBe(before);
  });
  it('keeps the widget shown and notifies once after dashboard close on Linux without tray', async () => {
    mocks.platform.isWindows = false;
    mocks.platform.isLinux = true;
    vi.resetModules();
    mocks.windows.length = 0; mocks.handlers.clear(); mocks.listeners.clear(); mocks.appEvents.clear(); mocks.shortcuts.clear();
    mocks.notifications.length = 0;
    mocks.closeHintShown = false;
    await import('./main');
    await Promise.resolve();
    // Cold start opens the dashboard when the tray is unconfirmed.
    const widget = mocks.windows[0];
    const main = mocks.windows[1];
    expect(main).toBeTruthy();
    widget.show.mockClear();
    main.destroy();
    expect(widget.isDestroyed()).toBe(false);
    expect(widget.show).toHaveBeenCalled();
    expect(mocks.notifications.some((n) => n.title.includes('ยังทำงานอยู่'))).toBe(true);
    expect(mocks.closeHintShown).toBe(true);
    const notified = mocks.notifications.length;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const again = mocks.windows[mocks.windows.length - 1];
    again.destroy();
    expect(mocks.notifications.length).toBe(notified);
  });
  it('recreates exactly one dashboard when second-instance runs after the window was destroyed', async () => {
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const firstMain = mocks.windows[1];
    expect(firstMain).toBeTruthy();
    firstMain.destroy();
    expect(firstMain.isDestroyed()).toBe(true);
    const before = mocks.windows.length;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows.length).toBe(before + 1);
    const recreated = mocks.windows[before];
    expect(recreated.isDestroyed()).toBe(false);
    expect(recreated.show).toHaveBeenCalled();
    expect(recreated.focus).toHaveBeenCalled();
    expect(recreated.loadURL).toHaveBeenCalledWith(expect.stringContaining('#/'));
  });
  it('shows and focuses an alive hidden window on second-instance without recreating or navigating', async () => {
    // win32/darwin tray-hide: isVisible===false by design; must not destroy+recreate.
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const main = mocks.windows[1];
    main.webContents.getURL.mockReturnValue('file:///app/index.html#/settings');
    main.isVisible.mockReturnValue(false);
    main.loadURL.mockClear();
    main.show.mockClear();
    main.focus.mockClear();
    main.webContents.send.mockClear();
    const before = mocks.windows.length;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows.length).toBe(before);
    expect(main.show).toHaveBeenCalled();
    expect(main.focus).toHaveBeenCalled();
    expect(main.loadURL).not.toHaveBeenCalled();
    expect(main.webContents.send).not.toHaveBeenCalledWith('nav:goto', '/');
  });
  it('restores and focuses an alive minimized window on second-instance without recreating', async () => {
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const main = mocks.windows[1];
    main.isMinimized.mockReturnValue(true);
    main.loadURL.mockClear();
    main.restore.mockClear();
    main.show.mockClear();
    main.focus.mockClear();
    const before = mocks.windows.length;
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    expect(mocks.windows.length).toBe(before);
    expect(main.restore).toHaveBeenCalled();
    expect(main.show).toHaveBeenCalled();
    expect(main.focus).toHaveBeenCalled();
    expect(main.loadURL).not.toHaveBeenCalled();
  });
  it('keeps dashboard navigation in place without reloading its renderer', async () => {
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    const main = mocks.windows[1];
    main.loadURL.mockClear();
    await mocks.handlers.get('app:open-main-window')!({ sender: main.webContents }, '/history');
    expect(main.loadURL).not.toHaveBeenCalled();
    expect(main.webContents.send).toHaveBeenCalledWith('nav:goto', '/history');
  });
  it('locks rapid starts and retains the original target when stopping', async () => {
    startHotkey(); startHotkey();
    expect(mocks.foreground).toHaveBeenCalledOnce();
    expect(mocks.windows[0].webContents.send).toHaveBeenCalledTimes(1);
    state('starting'); startHotkey();
    expect(mocks.foreground).toHaveBeenCalledOnce();
    state('recording'); startHotkey();
    expect(mocks.foreground).toHaveBeenCalledOnce();
    state('processing');
    await run();
    expect(mocks.paste).toHaveBeenCalledWith('transcript', { hwnd: '123', processName: 'test' }, expect.any(AbortSignal));
    expect(mocks.addHistory.mock.invocationCallOrder[0]).toBeLessThan(mocks.paste.mock.invocationCallOrder[0]);
  });
  it('does not retarget from a hotkey while processing', () => {
    state('processing'); startHotkey();
    expect(mocks.foreground).not.toHaveBeenCalled();
    expect(mocks.shortcuts.has('Escape')).toBe(true);
    state('idle');
    expect(mocks.shortcuts.has('Escape')).toBe(false);
  });
  it('passes unknown foreground through without a paste target', async () => {
    mocks.foreground.mockRejectedValue(new Error('host unavailable'));
    startHotkey(); state('processing');
    await run();
    expect(mocks.foreground).toHaveBeenCalledTimes(2);
    expect(mocks.paste).toHaveBeenCalledWith('transcript', null, expect.any(AbortSignal));
  });
  it('waits for a slow foreground host instead of dropping the HWND', async () => {
    mocks.foreground.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ hwnd: '456', processName: 'notepad' }), 350);
    }));
    startHotkey(); state('processing');
    await run();
    expect(mocks.paste).toHaveBeenCalledWith('transcript', { hwnd: '456', processName: 'notepad' }, expect.any(AbortSignal));
  });
  it('retries after a cold host fails and uses the HWND from the restarted lookup', async () => {
    mocks.foreground
      .mockRejectedValueOnce(new Error('win host did not become ready'))
      .mockResolvedValueOnce({ hwnd: '789', processName: 'chrome' });
    startHotkey(); state('processing');
    await run();
    expect(mocks.foreground).toHaveBeenCalledTimes(2);
    expect(mocks.paste).toHaveBeenCalledWith('transcript', { hwnd: '789', processName: 'chrome' }, expect.any(AbortSignal));
  });
  it('cancels an active request and prevents late history/paste', async () => {
    mocks.transcribe.mockImplementation((_audio, _mime, _settings, _bias, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    startHotkey(); state('processing');
    const result = run();
    await vi.waitFor(() => expect(mocks.transcribe).toHaveBeenCalledOnce());
    await mocks.handlers.get('transcription:cancel')!({ sender: mocks.windows[0].webContents });
    expect(await result).toMatchObject({ ok: false, error: 'ยกเลิกการทำงานแล้ว' });
    expect(mocks.paste).not.toHaveBeenCalled(); expect(mocks.addHistory).not.toHaveBeenCalled();
  });
  it('aborts on renderer crash and creates a replacement with fresh trusted identity', async () => {
    vi.useFakeTimers();
    const original = mocks.windows[0];
    original.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(mocks.shortcuts.has('Escape')).toBe(false);
    await vi.advanceTimersByTimeAsync(RUNTIME.widgetRecoveryDelayMs);
    expect(mocks.windows).toHaveLength(2);
    await expect(mocks.handlers.get('transcription:run')!({ sender: original.webContents }, payload())).rejects.toThrow('unauthorized');
    state('idle', mocks.windows[1]);
    startHotkey();
    expect(mocks.windows[1].webContents.send).toHaveBeenCalled();
  });
  it('limits repeated renderer failures instead of restarting forever', async () => {
    vi.useFakeTimers();
    for (let attempt = 0; attempt <= RUNTIME.widgetRecoveryAttempts; attempt++) {
      mocks.windows.at(-1)!.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
      await vi.advanceTimersByTimeAsync(RUNTIME.widgetRecoveryDelayMs);
    }
    expect(mocks.windows).toHaveLength(RUNTIME.widgetRecoveryAttempts + 1);
    startHotkey(); expect(mocks.foreground).not.toHaveBeenCalled();
  });
  it('aborts provider work when the widget crashes and never pastes afterwards', async () => {
    mocks.transcribe.mockImplementation((_audio, _mime, _settings, _bias, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    startHotkey(); state('processing');
    const result = run();
    await vi.waitFor(() => expect(mocks.transcribe).toHaveBeenCalledOnce());
    mocks.windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(await result).toMatchObject({ ok: false });
    expect(mocks.paste).not.toHaveBeenCalled();
  });
  it('blocks a second transcription while a first request is active', async () => {
    mocks.transcribe.mockImplementation((_audio, _mime, _settings, _bias, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const first = run();
    await vi.waitFor(() => expect(mocks.transcribe).toHaveBeenCalledOnce());
    expect(await run()).toMatchObject({ ok: false });
    await mocks.handlers.get('transcription:cancel')!({ sender: mocks.windows[0].webContents });
    await first;
    expect(mocks.transcribe).toHaveBeenCalledOnce();
  });
  it('rejects invalid duration/audio before making a provider request', async () => {
    for (const invalid of [{ ...payload(), durationMs: Number.NaN }, { ...payload(), durationMs: -1 }, { ...payload(), mimeType: 'text/html' }]) {
      expect(await mocks.handlers.get('transcription:run')!({ sender: mocks.windows[0].webContents }, invalid)).toMatchObject({ ok: false });
    }
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
  it('still delivers text when history persistence fails', async () => {
    mocks.addHistory.mockRejectedValue(new Error('disk full'));
    startHotkey(); state('processing');
    expect(await run()).toMatchObject({ ok: true, pasted: true });
    expect(mocks.paste).toHaveBeenCalledOnce();
  });
  it('restores previous hotkeys and Escape when a saved accelerator conflicts', async () => {
    mocks.appEvents.get('second-instance')?.();
    await Promise.resolve();
    state('recording');
    expect(() => mocks.handlers.get('settings:set')!({ sender: mocks.windows[1].webContents }, { hotkey: 'Control+Alt+T' })).toThrow('คืนค่า');
    expect(mocks.setSettings).toHaveBeenLastCalledWith({ hotkey: 'Control+Space', translateHotkey: 'Control+Alt+T' });
    expect(mocks.shortcuts.has('Control+Space')).toBe(true);
    expect(mocks.shortcuts.has('Escape')).toBe(true);
  });
});
