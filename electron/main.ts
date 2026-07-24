import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSettings, setSettings, type AppSettings } from './config';
import { transcribeAudio, TranscriptionError } from './transcribe';
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
import { polishText } from './polish';
import { translateText } from './translate';
import { getActiveAppCategory } from './activeWindow';

type RecordingMode = 'dictate' | 'translate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 90;

let widget: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function widgetBounds() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.round((width - WIDGET_WIDTH) / 2),
    y: height - WIDGET_HEIGHT - 16,
  };
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

  if (VITE_DEV_SERVER_URL) {
    widget.loadURL(VITE_DEV_SERVER_URL);
  } else {
    widget.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  screen.on('display-metrics-changed', () => {
    if (!widget) return;
    const { x: nx, y: ny } = widgetBounds();
    widget.setPosition(nx, ny);
  });
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
    title: 'OpenPud',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const url = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#${route}`
    : `file://${path.join(__dirname, '../dist/index.html')}#${route}`;
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAO0lEQVR4nGOQkJBhoATjkviPAxNlAC7NWA0hVTOGIeRoRjGEXM1wQ0YNoKIBFEcjVRISVZIyVTITSRgAW5XnZbzkvwwAAAAASUVORK5CYII=',
  );
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('OpenPud');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'เปิดแอป', click: () => createMainWindow('/') },
      { label: 'ตั้งค่า', click: () => createMainWindow('/settings') },
      { type: 'separator' },
      { label: 'ออกจากโปรแกรม', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => createMainWindow('/'));
}

function applyLaunchAtStartup(enabled: boolean) {
  if (!app.isPackaged) return; // login item registration is unreliable for `electron .` dev launches
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
      widget?.webContents.send('hotkey:toggle-recording', mode);
    });
    if (!ok) {
      console.error(`Failed to register hotkey (${mode}): ${accelerator}`);
    }
  }
}

app.whenReady().then(() => {
  createWidget();
  createTray();
  registerHotkeys(getSettings());
  applyLaunchAtStartup(getSettings().launchAtStartup);

  if (!getSettings().onboardingCompleted) {
    createMainWindow('/onboarding');
  }

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_e, partial: Partial<AppSettings>) => {
    const updated = setSettings(partial);
    if (partial.hotkey || partial.translateHotkey) registerHotkeys(updated);
    if (partial.launchAtStartup !== undefined) applyLaunchAtStartup(partial.launchAtStartup);
    return updated;
  });

  ipcMain.handle('app:open-main-window', (_e, route: string) => createMainWindow(route || '/'));

  ipcMain.handle(
    'transcription:run',
    async (
      _e,
      payload: { buffer: ArrayBuffer; mimeType: string; durationMs: number; mode?: RecordingMode },
    ) => {
      const settings = getSettings();
      const mode = payload.mode ?? 'dictate';
      try {
        const bias = dictionaryPrompt();
        let text = await transcribeAudio(Buffer.from(payload.buffer), payload.mimeType, settings, bias);

        if (mode === 'translate') {
          // Corrections on the transcript before translate so wrong-script
          // substitutions don't get translated as-is.
          text = applyCorrections(text);
          text = await translateText(text, settings);
        } else {
          if (settings.aiPolishEnabled) {
            const category = await getActiveAppCategory();
            text = await polishText(text, settings, category);
          }
          // After polish: AI cleanup used to run after corrections and could
          // undo exact replacements the user configured (e.g. "บอก" → "or").
          text = applyCorrections(text);
        }

        await pasteAtCursor(text);
        addHistoryEntry(text, payload.durationMs);
        mainWindow?.webContents.send('history:updated');
        return { ok: true as const, text };
      } catch (err) {
        const message =
          err instanceof TranscriptionError || err instanceof LlmError ? err.message : String(err);
        if (Notification.isSupported()) {
          new Notification({ title: 'ทำงานไม่สำเร็จ', body: message }).show();
        }
        return { ok: false as const, error: message };
      }
    },
  );

  ipcMain.handle('history:list', () => listHistory());
  ipcMain.handle('history:stats', () => historyStats());
  ipcMain.handle('history:clear', () => {
    clearHistory();
    return listHistory();
  });

  ipcMain.handle('dictionary:list', () => listDictionaryWords());
  ipcMain.handle('dictionary:set', (_e, words: string[]) => setDictionaryWords(words));
  ipcMain.handle('corrections:list', () => listCorrections());
  ipcMain.handle('corrections:set', (_e, rules: CorrectionRule[]) => setCorrections(rules));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWidget();
  });
});

app.on('window-all-closed', () => {
  // Widget + tray keep the app running in the background; only quit explicitly via tray menu.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
