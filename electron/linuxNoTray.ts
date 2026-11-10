import { spawnSync } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { isLinux } from './platform';

export type WidgetHitRect = { x: number; y: number; width: number; height: number };

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
 * non-destroyed BrowserWindow whose X window is already gone. Recreate only then.
 */
export function linuxNoTrayFocusAction(input: {
  hasWindow: boolean;
  isDestroyed: boolean;
  /** null = probe unavailable; false = X window missing (zombie). */
  xWindowMapped: boolean | null;
}): LinuxNoTrayFocusAction {
  if (!input.hasWindow || input.isDestroyed) return 'recreate';
  if (input.xWindowMapped === false) return 'recreate';
  return 'focus-existing';
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

type XProbe = (xid: number) => boolean | null;

function defaultXProbe(xid: number): boolean | null {
  try {
    const result = spawnSync('xwininfo', ['-id', `0x${xid.toString(16)}`], {
      encoding: 'utf8',
      timeout: 400,
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return result.status === 0;
  } catch {
    return null;
  }
}

/** true = mapped, false = gone, null = cannot probe on this host. */
export function linuxXWindowMapped(
  win: Pick<BrowserWindow, 'getNativeWindowHandle' | 'isDestroyed'>,
  probe: XProbe = defaultXProbe,
): boolean | null {
  const xid = readXWindowId(win);
  if (xid == null) return false;
  return probe(xid);
}
