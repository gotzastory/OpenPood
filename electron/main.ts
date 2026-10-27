import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray, type WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronUpdater from 'electron-updater';
import { UpdateController, UPDATE_SCHEDULE } from './updater';
import { getRendererSettings, getSettings, setSettings, type AppSettings } from './config';
import { normalizeThaiSpacing, transcribeAudio, TranscriptionError } from './transcribe';
import { pasteAtCursor } from './pasteText';
import { addHistoryEntry, listHistory, clearHistory, historyStats, flushHistory } from './history';
import { RUNTIME } from '../src/lib/runtimeConfig';
import { measureStage, reportDuration, startPerformanceSampling } from './performance';
import {
  listDictionaryWords,
  setDictionaryWords,
  dictionaryPrompt,
  listCorrections,
  setCorrections,
  applyCorrections,
  type CorrectionRule,
} from './dictionary';
import { LlmError } from './llm';
import { getOpenRouterUsage } from './openrouterUsage';
import { isElevenLabsProvider, ELEVENLABS_STT_ONLY_MESSAGE } from '../src/lib/elevenlabs';
import { polishText } from './polish';
import { stripFillers } from './stripFillers';
import { translateText } from './translate';
import { categoryForProcess, profileForProcess } from './activeWindow';
import { listAppProfiles, setAppProfiles } from './appProfiles';
import {
  disposeWinHost,
  getForegroundWindow,
  warmWinHost,
  type ForegroundWindow,
} from './winHost';

type RecordingMode = 'dictate' | 'translate';
type WidgetState = 'idle' | 'starting' | 'recording' | 'processing' | 'skipped';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const BRAND_ASSET_DIRECTORY = path.join(__dirname, VITE_DEV_SERVER_URL ? '../public/brand' : '../dist/brand');
const APP_ID = 'com.openpood.app';

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 90;

// Hard cap on audio handed over IPC — maxDurationSec is enforced only in the
// renderer, so the main process must not trust the payload size.
const MAX_AUDIO_BYTES = RUNTIME.maxAudioBytes;

// Routes the dashboard window may be opened at (must match src/app/shell.tsx).
const ALLOWED_ROUTES = new Set(['/', '/history', '/dictionary', '/settings', '/onboarding']);

// Both windows only ever show our own bundle; any other navigation target or
// popup is hostile (or a bug) and gets dropped.
function hardenWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = VITE_DEV_SERVER_URL ? url.startsWith(VITE_DEV_SERVER_URL) : url.startsWith('file://');
    if (!allowed) e.preventDefault();
  });
}

let widget: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let recordingState: WidgetState = 'idle';
let hotkeyPending = false;
let activeTranscriptions = 0;
let updater: UpdateController;
let updateStartupTimer: ReturnType<typeof setTimeout> | undefined;
let updateInterval: ReturnType<typeof setInterval> | undefined;
let widgetReady = false;
let quitting = false;
let shutdownComplete = false;
let shutdownPending = false;
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let recoveryAttempts = 0;
let lastRecoveryAt = 0;
let hotkeyAckTimer: ReturnType<typeof setTimeout> | undefined;
let hotkeyStartedAt = 0;
let transcriptionController: AbortController | null = null;
let transcriptionDone: Promise<void> = Promise.resolve();
let stopPerformanceSampling: () => void = () => undefined;

function sendToWindow(win: BrowserWindow | null, channel: string, ...args: unknown[]): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try { win.webContents.send(channel, ...args); }
  catch { console.warn('Renderer message could not be delivered.'); }
}

function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  } catch { console.warn('Native notification unavailable.'); }
}

function recoverWidget(win: BrowserWindow): void {
  if (quitting || widget !== win) return;
  widget = null;
  widgetReady = false;
  hotkeyPending = false;
  recordingState = 'idle';
  foregroundAtHotkey = Promise.resolve(null);
  clearTimeout(hotkeyAckTimer);
  transcriptionController?.abort();
  setEscapeCancel(false);
  updater?.refreshBusy();
  if (!win.isDestroyed()) win.destroy();
  if (Date.now() - lastRecoveryAt > RUNTIME.widgetRecoveryWindowMs) recoveryAttempts = 0;
  lastRecoveryAt = Date.now();
  if (++recoveryAttempts > RUNTIME.widgetRecoveryAttempts) {
    notify('เปิดไมโครโฟนไม่สำเร็จ', 'หน้าต่างอัดเสียงขัดข้องซ้ำ กรุณาปิดแล้วเปิด OpenPood ใหม่');
    return;
  }
  recoveryTimer = setTimeout(() => {
    recoveryTimer = undefined;
    if (quitting || widget) return;
    try { createWidget(); }
    catch { notify('เปิดไมโครโฟนไม่สำเร็จ', 'กรุณาปิดแล้วเปิด OpenPood ใหม่'); }
  }, RUNTIME.widgetRecoveryDelayMs);
}

async function captureForeground(): Promise<ForegroundWindow | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getForegroundWindow().catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), RUNTIME.foregroundCaptureTimeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

type RendererCapability = 'main' | 'widget' | 'either';

function isTrustedRenderer(sender: WebContents, capability: RendererCapability): boolean {
  const isMain = sender === mainWindow?.webContents;
  const isWidget = sender === widget?.webContents;
  return capability === 'main'
    ? isMain
    : capability === 'widget'
      ? isWidget
      : isMain || isWidget;
}

function requireRenderer(event: { sender: WebContents }, capability: RendererCapability): void {
  if (!isTrustedRenderer(event.sender, capability)) {
    throw new Error('unauthorized renderer');
  }
}

// Capture once at the start press. Stopping in another window must never retarget
// the dictation. Slow/unavailable lookups deliberately fall back to clipboard.
let foregroundAtHotkey: Promise<ForegroundWindow | null> = Promise.resolve(null);

// Bottom-center of whichever monitor the cursor is on, not just the primary.
function widgetBounds() {
  const { x, y, width, height } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  return {
    x: x + Math.round((width - WIDGET_WIDTH) / 2),
    y: y + height - WIDGET_HEIGHT - 16,
  };
}

function moveWidgetToCursorDisplay() {
  if (!widget) return;
  const { x, y } = widgetBounds();
  widget.setPosition(x, y);
}

function createWidget() {
  const { x, y } = widgetBounds();
  widget = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  widget.setAlwaysOnTop(true, 'screen-saver');
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widget.setIgnoreMouseEvents(true);
  hardenWindow(widget);
  const win = widget;
  widgetReady = false;
  win.webContents.on('render-process-gone', () => recoverWidget(win));
  win.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) recoverWidget(win);
  });
  win.webContents.on('did-finish-load', () => {
    if (widget !== win || widgetReady) return;
    clearTimeout(hotkeyAckTimer);
    hotkeyAckTimer = setTimeout(() => { if (!widgetReady) recoverWidget(win); }, RUNTIME.hotkeyAckTimeoutMs);
  });
  win.on('closed', () => recoverWidget(win));

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL).catch(() => recoverWidget(win));
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html')).catch(() => recoverWidget(win));
  }
}

function createMainWindow(route: string) {
  const url = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#${route}`
    : `file://${path.join(__dirname, '../dist/index.html')}#${route}`;
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // Onboarding mounts a different root and has no dashboard navigation listener.
    const wasOnboarding = mainWindow.webContents.getURL().split('#')[1] === '/onboarding';
    if (wasOnboarding !== (route === '/onboarding')) {
      const win = mainWindow;
      // A hash-only load is same-document navigation: rerun the surface entrypoint.
      void win.loadURL(url).then(() => { if (!win.isDestroyed()) win.reload(); })
        .catch(() => notify('เปิดแอปไม่สำเร็จ', 'กรุณาปิดหน้าต่างแล้วเปิดใหม่จาก tray'));
    } else {
      sendToWindow(mainWindow, 'nav:goto', route);
    }
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'OpenPood',
    icon: path.join(BRAND_ASSET_DIRECTORY, 'openpood.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  hardenWindow(mainWindow);
  void mainWindow.loadURL(url).catch(() => notify('เปิดแอปไม่สำเร็จ', 'กรุณาปิดหน้าต่างแล้วเปิดใหม่จาก tray'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(BRAND_ASSET_DIRECTORY, 'openpood-symbol.png'));
  if (icon.isEmpty()) throw new Error('OpenPood tray icon is missing');
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('OpenPood');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'เปิดแอป', click: () => createMainWindow('/') },
      { label: 'ตั้งค่า', click: () => createMainWindow('/settings') },
      { label: 'อัปเดตเวอร์ชัน', click: () => createMainWindow('/settings') },
      { type: 'separator' },
      { label: 'ออกจากโปรแกรม', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => createMainWindow('/'));
}

function applyLaunchAtStartup(enabled: boolean) {
  if (!app.isPackaged) return; // login item registration is unreliable for `electron .` dev launches
  // Remove the former Run entry so upgrades do not launch a stale OpenPud.exe.
  app.setLoginItemSettings({ openAtLogin: false, name: 'OpenPud' });
  app.setLoginItemSettings({ openAtLogin: enabled });
}

function registerHotkeys(settings: AppSettings): string[] {
  const failed: string[] = [];
  globalShortcut.unregisterAll();
  const bindings: [string, RecordingMode][] = [
    [settings.hotkey, 'dictate'],
    [settings.translateHotkey, 'translate'],
  ];
  for (const [accelerator, mode] of bindings) {
    if (!accelerator) continue;
    let ok = false;
    try { ok = globalShortcut.register(accelerator, () => {
      if (quitting || updater?.isInstalling() || !widgetReady || hotkeyPending
        || recordingState === 'starting' || recordingState === 'processing' || activeTranscriptions > 0) return;
      const starting = recordingState === 'idle' || recordingState === 'skipped';
      hotkeyPending = true;
      if (starting) {
        hotkeyStartedAt = performance.now();
        foregroundAtHotkey = captureForeground();
        setEscapeCancel(true);
      }
      clearTimeout(hotkeyAckTimer);
      const win = widget;
      hotkeyAckTimer = setTimeout(() => { if (hotkeyPending && win) recoverWidget(win); }, RUNTIME.hotkeyAckTimeoutMs);
      updater?.refreshBusy();
      moveWidgetToCursorDisplay();
      sendToWindow(widget, 'hotkey:toggle-recording', mode);
    }); } catch { /* Invalid or unavailable accelerator. */ }
    if (!ok) {
      failed.push(mode);
      console.warn(`Failed to register ${mode} hotkey.`);
    }
  }
  if (failed.length) notify('ปุ่มลัดใช้งานไม่ได้', 'ปุ่มลัดอาจถูกแอปอื่นใช้อยู่ กรุณาเลือกปุ่มลัดใหม่ใน Settings');
  return failed;
}

// Escape cancels setup, recording, and processing; other apps keep it when idle.
function setEscapeCancel(enabled: boolean) {
  if (enabled) {
    if (globalShortcut.isRegistered('Escape')) return;
    const ok = globalShortcut.register('Escape', () => {
      sendToWindow(widget, 'hotkey:cancel-recording');
    });
    if (!ok) console.error('Failed to register Escape as cancel key');
  } else {
    globalShortcut.unregister('Escape');
  }
}

app.on('second-instance', () => {
  if (quitting) return;
  void app.whenReady().then(() => createMainWindow('/')).catch(() => app.quit());
});

app.whenReady().then(() => {
  stopPerformanceSampling = startPerformanceSampling();
  warmWinHost();
  createWidget();
  createTray();
  registerHotkeys(getSettings());
  applyLaunchAtStartup(getSettings().launchAtStartup);
  let notifiedVersion: string | undefined;
  updater = new UpdateController(
    electronUpdater.autoUpdater,
    app.getVersion(),
    app.isPackaged && process.platform === 'win32',
    () => hotkeyPending || recordingState === 'starting' || recordingState === 'recording' || recordingState === 'processing' || activeTranscriptions > 0,
    (status) => {
      sendToWindow(mainWindow, 'updates:status', status);
      if (status.phase === 'available' && status.version !== notifiedVersion && Notification.isSupported()) {
        notifiedVersion = status.version;
        const notification = new Notification({ title: 'มี OpenPood เวอร์ชันใหม่', body: `เวอร์ชัน ${status.version} พร้อมดาวน์โหลด เปิดการตั้งค่าเพื่ออัปเดต` });
        notification.on('click', () => createMainWindow('/settings'));
        notification.show();
      }
    },
    () => globalShortcut.unregisterAll(),
    () => {
      quitting = false;
      registerHotkeys(getSettings());
      setEscapeCancel(recordingState === 'starting' || recordingState === 'recording' || recordingState === 'processing');
    },
  );
  if (app.isPackaged && process.platform === 'win32') {
    updateStartupTimer = setTimeout(() => { void updater.check(); }, UPDATE_SCHEDULE.startupDelayMs);
    updateInterval = setInterval(() => { void updater.check(); }, UPDATE_SCHEDULE.intervalMs);
  }
  ipcMain.handle('updates:get', (event) => { requireRenderer(event, 'main'); return updater.getStatus(); });
  ipcMain.handle('updates:check', (event) => { requireRenderer(event, 'main'); return updater.check(); });
  ipcMain.handle('updates:download', (event) => { requireRenderer(event, 'main'); return updater.download(); });
  ipcMain.handle('updates:install', (event) => { requireRenderer(event, 'main'); return updater.install(); });

  // Registered once here, not inside createWidget() — `activate` re-creates
  // the widget and would otherwise stack duplicate listeners.
  screen.on('display-metrics-changed', () => {
    if (!widget) return;
    const { x: nx, y: ny } = widgetBounds();
    widget.setPosition(nx, ny);
  });

  if (!getSettings().onboardingCompleted) {
    createMainWindow('/onboarding');
  }

  // The plaintext API key never leaves the main process; the renderer only
  // gets `hasApiKey` so the settings page can show a saved-key placeholder.
  ipcMain.handle('settings:get', (event) => {
    requireRenderer(event, 'either');
    return getRendererSettings();
  });

  ipcMain.handle('settings:set', (event, partial: Partial<AppSettings>) => {
    requireRenderer(event, 'main');
    if (typeof partial !== 'object' || partial === null) return getRendererSettings();
    const previous = getSettings();
    const updated = setSettings(partial);
    if (partial.hotkey !== undefined || partial.translateHotkey !== undefined) {
      const failed = registerHotkeys(updated);
      if (failed.length) {
        setSettings({ hotkey: previous.hotkey, translateHotkey: previous.translateHotkey });
        registerHotkeys(previous);
        setEscapeCancel(hotkeyPending || recordingState === 'starting' || recordingState === 'recording' || recordingState === 'processing');
        throw new Error('ปุ่มลัดไม่พร้อมใช้งาน คืนค่าปุ่มลัดเดิมแล้ว กรุณาเลือกปุ่มลัดใหม่');
      }
      setEscapeCancel(recordingState === 'starting' || recordingState === 'recording' || recordingState === 'processing');
    }
    if (partial.launchAtStartup !== undefined) applyLaunchAtStartup(partial.launchAtStartup);
    if (partial.apiBaseUrl !== undefined || partial.apiKey !== undefined) sendToWindow(mainWindow, 'provider:changed');
    return getRendererSettings();
  });

  ipcMain.handle('app:open-main-window', (event, route: string) => {
    requireRenderer(event, 'main');
    createMainWindow(ALLOWED_ROUTES.has(route) ? route : '/');
  },
  );

  ipcMain.on('recording:state', (e, state: unknown) => {
    // Only the widget drives the global Escape grab.
    if (!widget || e.sender !== widget.webContents) return;
    if (state !== 'idle' && state !== 'starting' && state !== 'recording' && state !== 'processing' && state !== 'skipped') return;
    widgetReady = true;
    clearTimeout(hotkeyAckTimer);
    if (state === 'recording' && recordingState === 'starting') reportDuration('mic-start', performance.now() - hotkeyStartedAt);
    hotkeyPending = false;
    recordingState = state;
    updater.refreshBusy();
    setEscapeCancel(state === 'starting' || state === 'recording' || state === 'processing');
  });

  ipcMain.on('recording:error', (event) => {
    if (!isTrustedRenderer(event.sender, 'widget')) return;
    notify('อัดเสียงไม่สำเร็จ', 'ตรวจสอบสิทธิ์ไมโครโฟนและอุปกรณ์ แล้วลองใหม่');
  });
  ipcMain.handle('transcription:cancel', async (event) => {
    requireRenderer(event, 'widget');
    transcriptionController?.abort();
    await transcriptionDone;
  });

  ipcMain.handle(
    'transcription:run',
    async (
      event,
      payload: { buffer: ArrayBuffer; mimeType: string; durationMs: number; mode?: RecordingMode },
    ) => {
      requireRenderer(event, 'widget');
      if (updater.isInstalling()) return { ok: false as const, error: 'กำลังติดตั้งอัปเดต' };
      if (quitting || activeTranscriptions > 0) return { ok: false as const, error: 'กำลังทำงาน กรุณารอสักครู่' };
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !(payload.buffer instanceof ArrayBuffer) ||
        typeof payload.mimeType !== 'string' ||
        !['audio/webm', 'audio/webm;codecs=opus', 'audio/wav'].includes(payload.mimeType) ||
        !Number.isFinite(payload.durationMs) ||
        payload.durationMs < RUNTIME.minRecordingMs ||
        payload.durationMs > RUNTIME.maxRecordingSec * 1000 + RUNTIME.recorderStopTimeoutMs ||
        payload.buffer.byteLength === 0 ||
        payload.buffer.byteLength > MAX_AUDIO_BYTES
      ) {
        return { ok: false as const, error: 'invalid transcription payload' };
      }
      const settings = getSettings();
      const mode = payload.mode === 'translate' ? 'translate' : 'dictate';
      const controller = new AbortController();
      const sourceWidget = widget;
      transcriptionController = controller;
      let finishTranscription!: () => void;
      transcriptionDone = new Promise<void>((resolve) => { finishTranscription = resolve; });
      const assertCurrent = () => {
        controller.signal.throwIfAborted();
        if (quitting || widget !== sourceWidget) throw new Error('recording session ended');
      };
      const startedAt = performance.now();
      activeTranscriptions++;
      updater.refreshBusy();
      try {
        const target = await foregroundAtHotkey;
        assertCurrent();
        if (mode === 'translate' && isElevenLabsProvider(settings)) {
          throw new LlmError(ELEVENLABS_STT_ONLY_MESSAGE);
        }
        const bias = dictionaryPrompt();
        let text = await measureStage('stt', () => transcribeAudio(Buffer.from(payload.buffer), payload.mimeType, settings, bias, controller.signal));
        assertCurrent();

        // Cheap local pass before any LLM step — strips "อืมม" / "เอ่ออ" / "um"
        // without an API round-trip. Runs for both dictate and translate.
        // MUST run before normalizeThaiSpacing: the raw Whisper spacing is what
        // bounds filler tokens so real words (อ่าน, อ่าง) are never eaten.
        if (settings.stripFillersEnabled) {
          text = stripFillers(text);
        }
        text = normalizeThaiSpacing(text);

        if (mode === 'translate') {
          // Corrections on the transcript before translate so wrong-script
          // substitutions don't get translated as-is.
          text = applyCorrections(text);
          text = await measureStage('translate', () => translateText(text, settings, controller.signal));
        } else {
          // A matching app profile overrides the global polish switch both ways.
          const processName = target?.processName ?? '';
          const profile = profileForProcess(listAppProfiles(), processName);
          if ((profile ? profile.polish : settings.aiPolishEnabled) && !isElevenLabsProvider(settings)) {
            text = await measureStage('polish', () => polishText(text, settings, categoryForProcess(processName), controller.signal, profile?.tone));
          }
          // After polish: AI cleanup used to run after corrections and could
          // undo exact replacements the user configured (e.g. "บอก" → "or").
          text = applyCorrections(text);
        }

        assertCurrent();
        if (!text.trim() || text.length > RUNTIME.maxTextChars) throw new TranscriptionError('ไม่พบข้อความที่ใช้ได้จากเสียง — ลองใหม่อีกครั้ง');
        // Save before delivery so even unsupported clipboard formats have a
        // recovery path. A disk failure keeps a temporary in-memory entry.
        try {
          await measureStage('history', () => addHistoryEntry(text, payload.durationMs, settings.model));
        } catch {
          notify('บันทึกประวัติไม่สำเร็จ', 'ประวัติครั้งนี้อยู่ชั่วคราวในแอป กรุณาคัดลอกก่อนปิด และตรวจสอบพื้นที่หรือสิทธิ์เขียนไฟล์');
        }
        sendToWindow(mainWindow, 'history:updated');
        assertCurrent();
        const delivery = await measureStage('paste', () => pasteAtCursor(text, target, controller.signal));
        if (delivery.reason === 'focus-changed') {
          notify('ยืนยันหน้าต่างปลายทางไม่ได้', 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง');
        } else if (delivery.reason === 'clipboard-preserved') {
          notify('เก็บ clipboard เดิมไว้แล้ว', 'clipboard มีไฟล์ รูปแบบพิเศษ หรือถูกเปลี่ยน กรุณาคัดลอกข้อความจาก History');
        } else if (delivery.reason === 'paste-failed') {
          notify('วางข้อความไม่สำเร็จ', 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง');
        }
        return { ok: true as const, text, pasted: delivery.pasted };
      } catch (err) {
        const message = controller.signal.aborted ? 'ยกเลิกการทำงานแล้ว'
          : err instanceof TranscriptionError || err instanceof LlmError ? err.message : 'ทำงานไม่สำเร็จ กรุณาลองใหม่';
        if (!controller.signal.aborted) notify('ทำงานไม่สำเร็จ', message);
        return { ok: false as const, error: message };
      } finally {
        activeTranscriptions--;
        if (transcriptionController === controller) transcriptionController = null;
        finishTranscription();
        reportDuration('dictation-total', performance.now() - startedAt);
        updater.refreshBusy();
      }
    },
  );

  ipcMain.handle('history:list', (event) => {
    requireRenderer(event, 'main');
    return listHistory();
  });
  ipcMain.handle('history:stats', (event) => {
    requireRenderer(event, 'main');
    return historyStats();
  });
  ipcMain.handle('usage:get', (event) => {
    requireRenderer(event, 'main');
    return getOpenRouterUsage(getSettings());
  });
  ipcMain.handle('history:clear', async (event) => {
    requireRenderer(event, 'main');
    await clearHistory();
    sendToWindow(mainWindow, 'history:updated');
    return listHistory();
  });

  ipcMain.handle('dictionary:list', (event) => {
    requireRenderer(event, 'main');
    return listDictionaryWords();
  });
  ipcMain.handle('dictionary:set', (event, words: unknown) => {
    requireRenderer(event, 'main');
    return setDictionaryWords(
      Array.isArray(words) ? words.filter((w): w is string => typeof w === 'string') : [],
    );
  });
  ipcMain.handle('corrections:list', (event) => {
    requireRenderer(event, 'main');
    return listCorrections();
  });
  ipcMain.handle('corrections:set', (event, rules: unknown) => {
    requireRenderer(event, 'main');
    return setCorrections(
      Array.isArray(rules)
        ? rules.filter(
            (r): r is CorrectionRule =>
              typeof r === 'object' && r !== null && typeof r.from === 'string' && typeof r.to === 'string',
          )
        : [],
    );
  });

  ipcMain.handle('appProfiles:list', (event) => {
    requireRenderer(event, 'main');
    return listAppProfiles();
  });
  ipcMain.handle('appProfiles:set', (event, profiles: unknown) => {
    requireRenderer(event, 'main');
    return setAppProfiles(profiles);
  });

  app.on('activate', () => {
    if (!quitting && !recoveryTimer && BrowserWindow.getAllWindows().length === 0) createWidget();
  });
}).catch(() => {
  // Without this, a throw during startup (e.g. corrupt store) silently skips
  // all IPC handler registration and leaves a zombie app.
  console.error('OpenPood startup failed.');
  dialog.showErrorBox('OpenPood เริ่มทำงานไม่สำเร็จ', 'กรุณาตรวจสอบไฟล์ตั้งค่าและสิทธิ์ของแอป แล้วเปิดใหม่');
  app.quit();
});

app.on('window-all-closed', () => {
  // Widget + tray keep the app running in the background; only quit explicitly via tray menu.
});

app.on('will-quit', () => {
  stopPerformanceSampling();
  clearTimeout(recoveryTimer);
  clearTimeout(hotkeyAckTimer);
  clearTimeout(updateStartupTimer);
  clearInterval(updateInterval);
  globalShortcut.unregisterAll();
  disposeWinHost();
});

app.on('before-quit', (event) => {
  quitting = true;
  clearTimeout(recoveryTimer);
  transcriptionController?.abort();
  if (shutdownComplete || updater?.isInstalling()) return;
  event.preventDefault();
  if (shutdownPending) return;
  shutdownPending = true;
  void transcriptionDone.then(() => flushHistory()).catch(() => undefined).finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
