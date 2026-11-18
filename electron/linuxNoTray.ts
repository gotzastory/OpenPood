import { spawnSync } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { isLinux } from './platform';

export type WidgetHitRect = { x: number; y: number; width: number; height: number };

export type OzonePlatformKind = 'x11' | 'wayland' | 'unknown';

/** setShape is only applied for the Linux persistent no-tray shell. */
export function shouldApplyWidgetHitShape(
  persistentNoTrayMode: boolean,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return persistentNoTrayMode && isLinux(platform);
}

/**
 * Clamp a renderer-reported hit rect to the widget window. Returns null when
 * the payload is unusable (non-finite / empty after clamp).
 */
export function clampWidgetHitRect(
  rect: WidgetHitRect,
  windowSize: { width: number; height: number },
): WidgetHitRect | null {
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null;
  }
  const left = Math.max(0, Math.min(windowSize.width, Math.round(rect.x)));
  const top = Math.max(0, Math.min(windowSize.height, Math.round(rect.y)));
  const right = Math.max(0, Math.min(windowSize.width, Math.round(rect.x + rect.width)));
  const bottom = Math.max(0, Math.min(windowSize.height, Math.round(rect.y + rect.height)));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return { x: left, y: top, width, height };
}

export type LinuxNoTrayFocusAction = 'focus-existing' | 'recreate';

/**
 * After external XDestroyWindow (e.g. xdotool windowclose), Electron can keep a
 * non-destroyed BrowserWindow whose X window is already gone. Recreate only when
 * xWindowMapped is explicitly false (confirmed BadWindow on X11).
 */
export function linuxNoTrayFocusAction(input: {
  hasWindow: boolean;
  isDestroyed: boolean;
  /** null = unknown / not X11; false = confirmed BadWindow zombie. */
  xWindowMapped: boolean | null;
}): LinuxNoTrayFocusAction {
  if (!input.hasWindow || input.isDestroyed) return 'recreate';
  if (input.xWindowMapped === false) return 'recreate';
  return 'focus-existing';
}

/**
 * Resolve Electron's effective ozone platform.
 * Prefer the live --ozone-platform switch, then ELECTRON_OZONE_PLATFORM_HINT.
 * When auto/empty, mirror Chromium: wayland if WAYLAND_DISPLAY, else x11 if DISPLAY.
 * Anything else (or unsure) is unknown — never treat as x11.
 * Electron 43 does not expose a dedicated runtime getter beyond commandLine/env.
 */
export function resolveElectronOzonePlatform(input: {
  ozoneSwitch?: string;
  ozoneHint?: string;
  env?: NodeJS.ProcessEnv;
}): OzonePlatformKind {
  const raw = (input.ozoneSwitch || input.ozoneHint || '').trim().toLowerCase();
  if (raw === 'x11') return 'x11';
  if (raw === 'wayland') return 'wayland';
  if (raw === '' || raw === 'auto') {
    const env = input.env ?? {};
    if (env.WAYLAND_DISPLAY) return 'wayland';
    if (env.DISPLAY) return 'x11';
    return 'unknown';
  }
  return 'unknown';
}

export function readXWindowId(win: Pick<BrowserWindow, 'getNativeWindowHandle' | 'isDestroyed'>): number | null {
  try {
    if (win.isDestroyed()) return null;
    const buf = win.getNativeWindowHandle();
    if (!buf || buf.length < 4) return null;
    const xid = buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
    return Number.isFinite(xid) && xid > 0 ? xid : null;
  } catch {
    return null;
  }
}

export type XProbe = (xid: number) => boolean | null;

/**
 * Interpret xwininfo results: only exit!=0 with BadWindow in stderr is "gone".
 * ENOENT / timeout / other errors / exceptions → unknown (null).
 */
export function interpretXwininfoResult(input: {
  status: number | null;
  stderr?: string;
  error?: NodeJS.ErrnoException | Error | null;
  signal?: NodeJS.Signals | null;
}): boolean | null {
  if (input.error) {
    const code = (input.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ETIMEDOUT') return null;
    return null;
  }
  if (input.signal) return null;
  if (input.status === 0) return true;
  if (input.status != null && input.status !== 0) {
    const stderr = input.stderr ?? '';
    if (/BadWindow/i.test(stderr)) return false;
    return null;
  }
  return null;
}

export function defaultXProbe(xid: number): boolean | null {
  try {
    const result = spawnSync('xwininfo', ['-id', `0x${xid.toString(16)}`], {
      encoding: 'utf8',
      timeout: 400,
    });
    return interpretXwininfoResult({
      status: result.status,
      stderr: result.stderr ?? '',
      error: result.error ?? null,
      signal: result.signal,
    });
  } catch {
    return null;
  }
}

/**
 * true = X window mapped; false = confirmed BadWindow zombie; null = unknown
 * (not X11 ozone, unreadable XID, missing xwininfo, timeout, other errors).
 */
export function linuxXWindowMapped(
  win: Pick<BrowserWindow, 'getNativeWindowHandle' | 'isDestroyed'>,
  ozonePlatform: OzonePlatformKind,
  probe: XProbe = defaultXProbe,
): boolean | null {
  if (ozonePlatform !== 'x11') return null;
  const xid = readXWindowId(win);
  if (xid == null) return null;
  return probe(xid);
}
