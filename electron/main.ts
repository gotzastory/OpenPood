import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray, type WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronUpdater from 'electron-updater';
import { UpdateController, UPDATE_SCHEDULE } from './updater';
import { getRendererSettings, getSettings, setSettings, type AppSettings } from './config';
import { normalizeThaiSpacing, transcribeAudio, TranscriptionError } from './transcribe';
import { pasteAtCursor } from './pasteText';
import { addHistoryEntry, listHistory, clearHistory, historyStats } from './history';
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
import { isElevenLabsProvider, ELEVENLABS_STT_ONLY_MESSAGE } from '../src/lib/elevenlabs';
import { polishText } from './polish';
import { stripFillers } from './stripFillers';
import { translateText } from './translate';
import { categoryForProcess } from './activeWindow';
import {
  disposeWinHost,
  getForegroundWindow,
  warmWinHost,
  type ForegroundWindow,
} from './winHost';

type RecordingMode = 'dictate' | 'translate';
type WidgetState = 'idle' | 'recording' | 'processing' | 'skipped';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const BRAND_ASSET_DIRECTORY = path.join(__dirname, VITE_DEV_SERVER_URL ? '../public/brand' : '../dist/brand');
const APP_ID = 'com.openpood.app';

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 90;

// Hard cap on audio handed over IPC — maxDurationSec is enforced only in the
// renderer, so the main process must not trust the payload size.
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

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

// Foreground window captured at the most recent hotkey press — that is the
// window the user expects the text to land in. Refreshed on every press so the
// stop press wins; on max-duration auto-stop the start press remains.
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

  if (VITE_DEV_SERVER_URL) {
    widget.loadURL(VITE_DEV_SERVER_URL);
  } else {
    widget.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createMainWindow(route: string) {
  if (mainWindow) {
    mainWindow.focus();
    mainWindow.webContents.send('nav:goto', route);
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
  const url = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#${route}`
    : `file://${path.join(__dirname, '../dist/index.html')}#${route}`;
  mainWindow.loadURL(url);
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

function registerHotkeys(settings: AppSettings) {
  globalShortcut.unregisterAll();
  const bindings: [string, RecordingMode][] = [
    [settings.hotkey, 'dictate'],
    [settings.translateHotkey, 'translate'],
  ];
  for (const [accelerator, mode] of bindings) {
    if (!accelerator) continue;
    const ok = globalShortcut.register(accelerator, () => {
      if (updater?.isInstalling()) return;
      hotkeyPending = true;
      updater?.refreshBusy();
      moveWidgetToCursorDisplay();
      widget?.webContents.send('hotkey:toggle-recording', mode);
      // Widget is focusable:false, so the press never moves focus — whatever
      // is in front right now is the paste target. Not awaited: the host
      // answers in a few ms and transcription:run picks the promise up later.
      foregroundAtHotkey = getForegroundWindow().catch(() => null);
    });
    if (!ok) {
      console.error(`Failed to register hotkey (${mode}): ${accelerator}`);
    }
  }
}

// Escape is grabbed system-wide ONLY while the mic is open (the widget reports
// its state), so other apps keep their Escape the rest of the time.
function setEscapeCancel(enabled: boolean) {
  if (enabled) {
    if (globalShortcut.isRegistered('Escape')) return;
    const ok = globalShortcut.register('Escape', () => {
      widget?.webContents.send('hotkey:cancel-recording');
    });
    if (!ok) console.error('Failed to register Escape as cancel key');
  } else {
    globalShortcut.unregister('Escape');
  }
}

app.on('second-instance', () => {
  void app.whenReady().then(() => createMainWindow('/')).catch(() => app.quit());
});

app.whenReady().then(() => {
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
    () => hotkeyPending || recordingState === 'recording' || recordingState === 'processing' || activeTranscriptions > 0,
    (status) => {
      mainWindow?.webContents.send('updates:status', status);
      if (status.phase === 'available' && status.version !== notifiedVersion && Notification.isSupported()) {
        notifiedVersion = status.version;
        const notification = new Notification({ title: 'มี OpenPood เวอร์ชันใหม่', body: `เวอร์ชัน ${status.version} พร้อมดาวน์โหลด เปิดการตั้งค่าเพื่ออัปเดต` });
        notification.on('click', () => createMainWindow('/settings'));
        notification.show();
      }
    },
    () => globalShortcut.unregisterAll(),
    () => { registerHotkeys(getSettings()); setEscapeCancel(recordingState === 'recording'); },
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
    const updated = setSettings(partial);
    if (partial.hotkey !== undefined || partial.translateHotkey !== undefined) {
      registerHotkeys(updated);
    }
    if (partial.launchAtStartup !== undefined) applyLaunchAtStartup(partial.launchAtStartup);
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
    if (state !== 'idle' && state !== 'recording' && state !== 'processing' && state !== 'skipped') return;
    hotkeyPending = false;
    recordingState = state;
    updater.refreshBusy();
    setEscapeCancel(state === ('recording' satisfies WidgetState));
  });

  ipcMain.handle(
    'transcription:run',
    async (
      event,
      payload: { buffer: ArrayBuffer; mimeType: string; durationMs: number; mode?: RecordingMode },
    ) => {
      requireRenderer(event, 'widget');
      if (updater.isInstalling()) return { ok: false as const, error: 'กำลังติดตั้งอัปเดต' };
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !(payload.buffer instanceof ArrayBuffer) ||
        typeof payload.mimeType !== 'string' ||
        payload.buffer.byteLength === 0 ||
        payload.buffer.byteLength > MAX_AUDIO_BYTES
      ) {
        return { ok: false as const, error: 'invalid transcription payload' };
      }
      const settings = getSettings();
      const mode = payload.mode === 'translate' ? 'translate' : 'dictate';
      activeTranscriptions++;
      updater.refreshBusy();
      try {
        const target = await foregroundAtHotkey;
        if (mode === 'translate' && isElevenLabsProvider(settings)) {
          throw new LlmError(ELEVENLABS_STT_ONLY_MESSAGE);
        }
        const bias = dictionaryPrompt();
        let text = await transcribeAudio(Buffer.from(payload.buffer), payload.mimeType, settings, bias);

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
          text = await translateText(text, settings);
        } else {
          if (settings.aiPolishEnabled && !isElevenLabsProvider(settings)) {
            text = await polishText(text, settings, categoryForProcess(target?.processName ?? ''));
          }
          // After polish: AI cleanup used to run after corrections and could
          // undo exact replacements the user configured (e.g. "บอก" → "or").
          text = applyCorrections(text);
        }

        // The request can take seconds; if the user alt-tabbed meanwhile, a
        // blind Ctrl+V would land in the wrong app. Leave it on the clipboard
        // instead and say so.
        const now = await getForegroundWindow().catch(() => null);
        const hasTarget = !!target && target.hwnd !== '0' && target.hwnd !== '';
        if (hasTarget && now && now.hwnd !== target.hwnd) {
          clipboard.writeText(text);
          if (Notification.isSupported()) {
            new Notification({
              title: 'หน้าต่างเปลี่ยนไป',
              body: 'คัดลอกข้อความไว้ใน clipboard แล้ว กด Ctrl+V เพื่อวาง',
            }).show();
          }
          addHistoryEntry(text, payload.durationMs, settings.model);
          mainWindow?.webContents.send('history:updated');
          return { ok: true as const, text, pasted: false };
        }

        let pasted = true;
        try {
          await pasteAtCursor(text);
        } catch (err) {
          // Text is still on the clipboard (pasteAtCursor does not restore on
          // failure) — tell the user instead of dropping the dictation.
          console.error('Paste failed:', err);
          pasted = false;
          if (Notification.isSupported()) {
            new Notification({
              title: 'วางข้อความไม่สำเร็จ',
              body: 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง',
            }).show();
          }
        }
        addHistoryEntry(text, payload.durationMs, settings.model);
        mainWindow?.webContents.send('history:updated');
        return { ok: true as const, text, pasted };
      } catch (err) {
        const message =
          err instanceof TranscriptionError || err instanceof LlmError ? err.message : String(err);
        if (Notification.isSupported()) {
          // Error text can embed a server-controlled response body — cap it so
          // an arbitrary endpoint can't fill a native toast with junk.
          new Notification({ title: 'ทำงานไม่สำเร็จ', body: message.slice(0, 200) }).show();
        }
        return { ok: false as const, error: message };
      } finally {
        activeTranscriptions--;
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
  ipcMain.handle('history:clear', (event) => {
    requireRenderer(event, 'main');
    clearHistory();
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWidget();
  });
}).catch((err) => {
  // Without this, a throw during startup (e.g. corrupt store) silently skips
  // all IPC handler registration and leaves a zombie app.
  console.error('Startup failed:', err);
  dialog.showErrorBox('OpenPood เริ่มทำงานไม่สำเร็จ', err instanceof Error ? err.message : String(err));
  app.quit();
});

app.on('window-all-closed', () => {
  // Widget + tray keep the app running in the background; only quit explicitly via tray menu.
});

app.on('will-quit', () => {
  clearTimeout(updateStartupTimer);
  clearInterval(updateInterval);
  globalShortcut.unregisterAll();
  disposeWinHost();
});
