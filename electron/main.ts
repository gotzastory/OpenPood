import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, screen, session, shell, Tray, type WebContents } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import electronUpdater from 'electron-updater';
import { UpdateController, UPDATE_SCHEDULE } from './updater';
import { getRendererSettings, getSettings, setSettings, type AppSettings } from './config';
import { normalizeThaiSpacing, transcribeAudio, TranscriptionError } from './transcribe';
import { pasteAtCursor } from './pasteText';
import { addHistoryEntry, listHistory, clearHistory, historyStats, flushHistory, warmHistory } from './history';
import { HistoryEncryptionUnavailable } from './historyRepository';
import { PRELOAD_FILENAME } from './preloadOutput';
import { isAppNavigationAllowed, isWidgetMediaAllowed } from './windowGuard';
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
import { hotkeyFailureMessage, isLinux, isWindows, pasteFallbackMessage, resolveUpdateChannel } from './platform';
import { notifyMissingMacPermissions, requestMacPermissions } from './permissions';
import { isDashboardCloseHintShown, markDashboardCloseHintShown } from './lifecyclePrefs';
import {
  clampWidgetHitRect,
  linuxNoTrayFocusAction,
  linuxXWindowMapped,
  resolveElectronOzonePlatform,
  shouldApplyWidgetHitShape,
  type WidgetHitRect,
} from './linuxNoTray';
import {
  linuxStatusNotifierPresent,
  needsPersistentNoTrayShell,
  resolveTrayConfirmed,
  secondInstanceAction,
  shouldOpenMainWindowOnColdStart,
  shouldShowDashboardCloseHint,
  windowCloseAction,
} from './windowLifecycle';

type RecordingMode = 'dictate' | 'translate';
type WidgetState = 'idle' | 'starting' | 'recording' | 'processing' | 'skipped';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const BRAND_ASSET_DIRECTORY = path.join(__dirname, VITE_DEV_SERVER_URL ? '../public/brand' : '../dist/brand');
const APP_ID = 'com.openpood.app';

if (isWindows()) app.setAppUserModelId(APP_ID);

const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 90;

// Hard cap on audio handed over IPC — maxDurationSec is enforced only in the
// renderer, so the main process must not trust the payload size.
const MAX_AUDIO_BYTES = RUNTIME.maxAudioBytes;

// Routes the dashboard window may be opened at (must match src/app/shell.tsx).
const ALLOWED_ROUTES = new Set(['/', '/history', '/dictionary', '/apps', '/settings', '/onboarding']);

// Both windows only ever show our own bundle; any other navigation target or
// popup is hostile (or a bug) and gets dropped.
function appPageUrl(): URL {
  return pathToFileURL(path.join(__dirname, '../dist/index.html'));
}

function hardenWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppNavigationAllowed(url, appPageUrl(), VITE_DEV_SERVER_URL)) event.preventDefault();
  });
}

function installSessionPermissions(): void {
  const allowed = (contents: WebContents | null, permission: string) =>
    isWidgetMediaAllowed(permission, contents != null && contents === widget?.webContents);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed(contents, permission));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => allowed(contents, permission));
}

const windowPreferences = {
  preload: path.join(__dirname, PRELOAD_FILENAME),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const;

let widget: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/**
 * True only when a tray reopen affordance is confirmed.
 * On Linux, `new Tray()` not throwing is insufficient — StatusNotifierWatcher must be present.
 */
let trayAvailable = false;
/** Linux-without-tray: keep a visible clickable widget and offer non-tray Quit. */
let persistentNoTrayMode = false;
const wiredWidgetMenus = new WeakSet<WebContents>();
/** Prevents double dashboard creation when relaunch is hammered during ensure. */
let ensuringLinuxNoTrayMain = false;
let lastWidgetHitRect: WidgetHitRect | null = null;
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

function requestAppQuit(): void {
  quitting = true;
  app.quit();
}

function applyWidgetHitShape(rect: WidgetHitRect | null): void {
  if (!shouldApplyWidgetHitShape(persistentNoTrayMode, process.platform)) return;
  if (!widget || widget.isDestroyed()) return;
  if (!rect) return;
  const clamped = clampWidgetHitRect(rect, widget.getBounds());
  if (!clamped) return;
  lastWidgetHitRect = clamped;
  try {
    // Linux/Windows experimental API: limit hit-testing to the pill so the
    // transparent 320x90 margin stays click-through (forward:true does not
    // work on Linux). Lower risk than constantly resizing the widget window.
    widget.setShape([clamped]);
  } catch (err) {
    console.warn('[widget] setShape unavailable:', err instanceof Error ? err.message : 'unknown');
  }
}

function enablePersistentWidgetShell(): void {
  if (!widget || widget.isDestroyed()) return;
  widget.setIgnoreMouseEvents(false);
  widget.show();
  sendToWindow(widget, 'widget:presence', { persistent: true });
  if (lastWidgetHitRect) applyWidgetHitShape(lastWidgetHitRect);
  const contents = widget.webContents;
  if (wiredWidgetMenus.has(contents)) return;
  wiredWidgetMenus.add(contents);
  contents.on('did-finish-load', () => {
    sendToWindow(widget, 'widget:presence', { persistent: true });
    if (lastWidgetHitRect) applyWidgetHitShape(lastWidgetHitRect);
  });
  contents.on('context-menu', () => {
    if (quitting || !widget || widget.isDestroyed()) return;
    Menu.buildFromTemplate([
      { label: 'เปิดแอป', click: () => { void focusOrCreateMainWindow(); } },
      { type: 'separator' },
      { label: 'ออกจากโปรแกรม', click: () => requestAppQuit() },
    ]).popup({ window: widget });
  });
}

function currentOzonePlatform() {
  // Electron 43: no dedicated ozone getter — commandLine switch + hint + env.
  return resolveElectronOzonePlatform({
    ozoneSwitch: app.commandLine.getSwitchValue('ozone-platform'),
    ozoneHint: process.env.ELECTRON_OZONE_PLATFORM_HINT,
    env: process.env,
  });
}

/**
 * Linux no-tray only: after external XDestroyWindow, Electron may keep a
 * non-destroyed BrowserWindow whose X window is gone (no close/closed). Detect
 * via xwininfo BadWindow on X11 ozone only; never use sync isVisible().
 */
function ensureLinuxNoTrayMainWindow(route = '/'): void {
  if (quitting || ensuringLinuxNoTrayMain) return;
  ensuringLinuxNoTrayMain = true;
  try {
    if (mainWindow?.isDestroyed()) mainWindow = null;
    const action = linuxNoTrayFocusAction({
      hasWindow: Boolean(mainWindow),
      isDestroyed: Boolean(mainWindow?.isDestroyed()),
      xWindowMapped: mainWindow ? linuxXWindowMapped(mainWindow, currentOzonePlatform()) : null,
    });
    if (action === 'recreate') {
      const stale = mainWindow;
      mainWindow = null;
      if (stale && !stale.isDestroyed()) {
        try { stale.destroy(); } catch { /* ignore */ }
      }
      createMainWindow(route);
      // createMainWindow mutates the module binding; CFA still sees the prior `null`.
      const created = mainWindow as BrowserWindow | null;
      if (created && !created.isDestroyed()) {
        created.show();
        created.focus();
      }
      return;
    }
    // Live mapped window: focus only — do not navigate away from the current route.
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  } finally {
    ensuringLinuxNoTrayMain = false;
  }
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
    try {
      createWidget();
      if (persistentNoTrayMode) enablePersistentWidgetShell();
    }
    catch { notify('เปิดไมโครโฟนไม่สำเร็จ', 'กรุณาปิดแล้วเปิด OpenPood ใหม่'); }
  }, RUNTIME.widgetRecoveryDelayMs);
}

const FOREGROUND_LOOKUP_ATTEMPTS = 2;

function knownForeground(window: ForegroundWindow): boolean {
  return /^[1-9]\d*$/.test(window.hwnd);
}

// Wait for the PowerShell host to compile and answer. A cold or crashed host
// is restarted by the next lookup; do not give up on a short timer.
// On macOS/Linux there is no HWND host — paste uses the current focused app.
async function captureForeground(): Promise<ForegroundWindow | null> {
  if (!isWindows()) return { hwnd: '1', processName: '' };
  for (let attempt = 0; attempt < FOREGROUND_LOOKUP_ATTEMPTS; attempt++) {
    try {
      const window = await getForegroundWindow();
      if (knownForeground(window)) return window;
    } catch (err) {
      console.warn('[winHost] foreground lookup failed:', err instanceof Error ? err.message : 'unknown');
    }
  }
  return null;
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
// the dictation. A lookup that still fails after a host restart leaves the target
// unknown; paste then keeps the previous clipboard and History holds the text.
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
    webPreferences: { ...windowPreferences },
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

function focusOrCreateMainWindow(): void {
  if (quitting) return;
  // Linux-without-tray: may need XID liveness check after external destroy.
  if (persistentNoTrayMode) {
    ensureLinuxNoTrayMainWindow('/');
    return;
  }
  if (mainWindow?.isDestroyed()) mainWindow = null;
  const action = secondInstanceAction(mainWindow ? 'alive' : 'absent');
  if (action === 'focus-existing' && mainWindow && !mainWindow.isDestroyed()) {
    // Alive window (including tray-hidden isVisible===false): never destroy/recreate
    // or navigate — only restore/show/focus so route and renderer state survive.
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  // Recreate only when the ref is null or was destroyed (`closed` must clear it).
  createMainWindow('/');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createMainWindow(route: string) {
  const url = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#${route}`
    : `${appPageUrl().href}#${route}`;
  if (mainWindow && !mainWindow.isDestroyed()) {
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
  // Stale destroyed ref (closed race) must not block recreation.
  mainWindow = null;
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'OpenPood',
    icon: path.join(BRAND_ASSET_DIRECTORY, 'openpood.ico'),
    webPreferences: { ...windowPreferences },
  });
  hardenWindow(mainWindow);
  void mainWindow.loadURL(url).catch(() => notify('เปิดแอปไม่สำเร็จ', 'กรุณาปิดหน้าต่างแล้วเปิดใหม่จาก tray'));
  mainWindow.on('close', (event) => {
    if (quitting) return;
    // Linux without confirmed tray: allow close so WM windowclose destroys for real.
    if (windowCloseAction(trayAvailable, process.platform) === 'minimize') {
      event.preventDefault();
      mainWindow?.minimize();
    }
  });
  // Must clear the ref on destroy paths (WM force-close / allowed close).
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!persistentNoTrayMode) return;
    // Keep the widget visible as the only on-screen affordance without a tray.
    enablePersistentWidgetShell();
    if (shouldShowDashboardCloseHint(isDashboardCloseHintShown())) {
      markDashboardCloseHintShown();
      notify(
        'OpenPood ยังทำงานอยู่',
        'เปิด OpenPood อีกครั้งเพื่อเรียกแดชบอร์ด หรือคลิกขวาที่วิดเจ็ตด้านล่างหน้าจอ',
      );
    }
  });
}

function createTray(): boolean {
  try {
    // Linux: probe the session bus first. Constructing Tray without a host still
    // "succeeds" and would wrongly enable destroy-keep-running close policy.
    const notifierPresent = isLinux() ? linuxStatusNotifierPresent() : true;
    if (isLinux() && !notifierPresent) {
      tray = null;
      trayAvailable = false;
      console.warn('[tray] Linux StatusNotifierWatcher not present; leaving tray unconfirmed');
      return false;
    }

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
    trayAvailable = resolveTrayConfirmed({
      platform: process.platform,
      trayConstructed: true,
      linuxStatusNotifierPresent: notifierPresent,
    });
    if (!trayAvailable) {
      tray.destroy();
      tray = null;
      return false;
    }
    return true;
  } catch (err) {
    tray = null;
    trayAvailable = false;
    console.warn('[tray] unavailable:', err instanceof Error ? err.message : 'unknown');
    notify(
      'ไม่มี system tray',
      'ปิดหน้าต่างจะย่อลงแถบงาน — เปิดแอปอีกครั้งเพื่อเรียกหน้าต่างกลับ หรือติดตั้ง libappindicator ตามเดสก์ท็อปของคุณ',
    );
    return false;
  }
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
  if (failed.length) {
    const message = hotkeyFailureMessage(failed);
    notify(message.title, message.body);
  }
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
  // Second AppImage/`openpood` launches should restore the existing dashboard.
  // The losing process exits in storage.ts after failing requestSingleInstanceLock().
  // Never quit the primary instance here — a focus/create throw would leave no app at all.
  if (quitting) return;
  void app.whenReady()
    .then(() => focusOrCreateMainWindow())
    .catch((err) => console.error('[second-instance] failed to show dashboard:', err));
});

app.whenReady().then(async () => {
  installSessionPermissions();
  stopPerformanceSampling = startPerformanceSampling();
  if (isWindows()) warmWinHost();
  warmHistory();
  createWidget();
  createTray();
  persistentNoTrayMode = needsPersistentNoTrayShell(trayAvailable, process.platform);
  if (persistentNoTrayMode) enablePersistentWidgetShell();
  // Without a confirmed tray (always the Linux default unless StatusNotifierWatcher
  // is present), open the dashboard so cold start is never headless.
  if (shouldOpenMainWindowOnColdStart(trayAvailable)) createMainWindow('/');
  registerHotkeys(getSettings());
  applyLaunchAtStartup(getSettings().launchAtStartup);
  const macPermissions = await requestMacPermissions();
  notifyMissingMacPermissions(notify, macPermissions);
  let notifiedVersion: string | undefined;
  const updateChannel = resolveUpdateChannel({ packaged: app.isPackaged });
  updater = new UpdateController(
    electronUpdater.autoUpdater,
    app.getVersion(),
    updateChannel,
    () => hotkeyPending || recordingState === 'starting' || recordingState === 'recording' || recordingState === 'processing' || activeTranscriptions > 0,
    (status) => {
      sendToWindow(mainWindow, 'updates:status', status);
      if (status.channel === 'in-app' && status.phase === 'available' && status.version !== notifiedVersion && Notification.isSupported()) {
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
    (url) => shell.openExternal(url),
  );
  if (updater.supportsAutoCheck()) {
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
    const next = ALLOWED_ROUTES.has(route) ? route : '/';
    if (persistentNoTrayMode) ensureLinuxNoTrayMainWindow(next);
    else createMainWindow(next);
  },
  );

  // Available on all OSes so Linux-without-tray (and tests) can quit without a tray menu.
  ipcMain.handle('app:quit', (event) => {
    requireRenderer(event, 'main');
    requestAppQuit();
  });

  // Widget → main hit region for setShape (Linux no-tray only). Non-widget senders ignored.
  ipcMain.on('widget:hit-region', (event, rect: unknown) => {
    if (!shouldApplyWidgetHitShape(persistentNoTrayMode, process.platform)) return;
    if (!widget || event.sender !== widget.webContents) return;
    if (!rect || typeof rect !== 'object') return;
    const candidate = rect as WidgetHitRect;
    applyWidgetHitShape(candidate);
  });

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
        if (settings.saveHistory !== false) {
          try {
            await measureStage('history', () => addHistoryEntry(text, payload.durationMs, settings.model));
          } catch (err) {
            const body = err instanceof HistoryEncryptionUnavailable
              ? err.message
              : err instanceof Error && err.message.startsWith('อ่านประวัติ')
                ? err.message
                : 'ประวัติครั้งนี้อยู่ชั่วคราวในแอป กรุณาคัดลอกก่อนปิด และตรวจสอบพื้นที่หรือสิทธิ์เขียนไฟล์';
            notify('บันทึกประวัติไม่สำเร็จ', body);
          }
          sendToWindow(mainWindow, 'history:updated');
        }
        assertCurrent();
        const delivery = await measureStage('paste', () => pasteAtCursor(text, target, controller.signal));
        if (delivery.reason === 'target-unknown') {
          notify('ยืนยันหน้าต่างปลายทางไม่ได้', 'ไม่พบหน้าต่างปลายทาง กรุณาคัดลอกข้อความจาก History');
        } else if (delivery.reason === 'focus-changed') {
          notify('ยืนยันหน้าต่างปลายทางไม่ได้', 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง');
        } else if (delivery.reason === 'clipboard-preserved') {
          notify('เก็บ clipboard เดิมไว้แล้ว', 'clipboard มีไฟล์ รูปแบบพิเศษ หรือถูกเปลี่ยน กรุณาคัดลอกข้อความจาก History');
        } else if (delivery.reason === 'paste-failed' || delivery.reason === 'injection-unavailable') {
          const message = pasteFallbackMessage(delivery.reason);
          notify(message.title, message.body);
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
  if (isWindows()) disposeWinHost();
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
