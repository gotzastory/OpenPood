import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEmitter } from 'node:events';
import { RUNTIME } from '../src/lib/runtimeConfig';

type TestWindow = EventEmitter & {
  webContents: EventEmitter & { send: ReturnType<typeof vi.fn>; setWindowOpenHandler: ReturnType<typeof vi.fn>; getURL: ReturnType<typeof vi.fn> };
  destroy: () => void;
  loadURL: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
};
const mocks = vi.hoisted(() => ({
  windows: [] as TestWindow[], handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(), appEvents: new Map<string, (...args: any[]) => any>(),
  shortcuts: new Map<string, () => void>(),
  foreground: vi.fn(), transcribe: vi.fn(), paste: vi.fn(), addHistory: vi.fn(), setSettings: vi.fn(),
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class BrowserWindow extends EventEmitter {
    static getAllWindows() { return mocks.windows; }
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), setWindowOpenHandler: vi.fn(), getURL: vi.fn(() => 'file:///app/index.html#/'), isDestroyed: () => this.destroyed });
    private destroyed = false;
    constructor() { super(); mocks.windows.push(this as TestWindow); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {} setPosition() {} focus() {}
    loadURL = vi.fn(() => Promise.resolve());
    isMinimized = vi.fn(() => false); restore = vi.fn(); show = vi.fn();
    reload = vi.fn();
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  class Notification { static isSupported() { return false; } }
  return {
    BrowserWindow, Tray, Notification,
    app: {
      setAppUserModelId: vi.fn(), whenReady: () => Promise.resolve(), isPackaged: false,
      getVersion: () => 'test-version', quit: vi.fn(), getAppMetrics: () => [],
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
    dialog: { showErrorBox: vi.fn() }, Menu: { buildFromTemplate: vi.fn() },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize: () => ({}) }) },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }), on: vi.fn() },
  };
});
vi.mock('electron-updater', () => ({ default: { autoUpdater: { on: vi.fn() } } }));
vi.mock('./config', () => {
  const settings = { apiKey: 'test-key', model: 'test-model', hotkey: 'Control+Space', translateHotkey: 'Control+Alt+T',
    launchAtStartup: false, onboardingCompleted: true, stripFillersEnabled: false, aiPolishEnabled: false, apiBaseUrl: 'https://provider.test' };
  return { getSettings: () => settings, getRendererSettings: () => ({ ...settings, apiKey: '', hasApiKey: true }),
    setSettings: mocks.setSettings.mockImplementation((partial) => ({ ...settings, ...partial })) };
});
vi.mock('./transcribe', () => ({ transcribeAudio: mocks.transcribe, normalizeThaiSpacing: (text: string) => text, TranscriptionError: class extends Error {} }));
vi.mock('./winHost', () => ({ getForegroundWindow: mocks.foreground, warmWinHost: vi.fn(), disposeWinHost: vi.fn() }));
vi.mock('./pasteText', () => ({ pasteAtCursor: mocks.paste }));
vi.mock('./history', () => ({ addHistoryEntry: mocks.addHistory, listHistory: () => [], clearHistory: vi.fn(), historyStats: () => ({}), flushHistory: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./appProfiles', () => ({ listAppProfiles: () => [], setAppProfiles: vi.fn() }));
vi.mock('./dictionary', () => ({ dictionaryPrompt: () => '', applyCorrections: (text: string) => text,
  listDictionaryWords: () => [], setDictionaryWords: vi.fn(), listCorrections: () => [], setCorrections: vi.fn() }));

const payload = () => ({ buffer: new ArrayBuffer(10), mimeType: 'audio/webm', durationMs: 1000 });
function state(value: string, win = mocks.windows[0]) { mocks.listeners.get('recording:state')?.({ sender: win.webContents }, value); }
function startHotkey() { mocks.shortcuts.get('Control+Space')?.(); }
function run() { return mocks.handlers.get('transcription:run')!({ sender: mocks.windows[0].webContents }, payload()); }

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.windows.length = 0; mocks.handlers.clear(); mocks.listeners.clear(); mocks.appEvents.clear(); mocks.shortcuts.clear();
  mocks.foreground.mockResolvedValue({ hwnd: '123', processName: 'test' });
  mocks.transcribe.mockResolvedValue('transcript'); mocks.paste.mockResolvedValue({ pasted: true }); mocks.addHistory.mockResolvedValue({});
  await import('./main');
  await Promise.resolve();
  state('idle');
});
afterEach(() => { mocks.appEvents.get('will-quit')?.(); vi.useRealTimers(); });

describe('main dictation integration', () => {
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
  it('passes unknown foreground through the clipboard fallback', async () => {
    mocks.foreground.mockRejectedValue(new Error('host unavailable'));
    startHotkey(); state('processing');
    await run();
    expect(mocks.paste).toHaveBeenCalledWith('transcript', null, expect.any(AbortSignal));
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
