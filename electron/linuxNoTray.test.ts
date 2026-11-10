import { describe, expect, it, vi } from 'vitest';
import {
  clampWidgetHitRect,
  linuxNoTrayFocusAction,
  linuxXWindowMapped,
  readXWindowId,
  shouldApplyWidgetHitShape,
} from './linuxNoTray';

describe('widget hit shape gating', () => {
  it('applies setShape only on Linux persistent no-tray', () => {
    expect(shouldApplyWidgetHitShape(true, 'linux')).toBe(true);
    expect(shouldApplyWidgetHitShape(false, 'linux')).toBe(false);
    expect(shouldApplyWidgetHitShape(true, 'win32')).toBe(false);
    expect(shouldApplyWidgetHitShape(true, 'darwin')).toBe(false);
  });

  it('clamps and recomputes usable rects inside the widget window', () => {
    expect(clampWidgetHitRect({ x: 10, y: 20, width: 100, height: 40 }, { width: 320, height: 90 }))
      .toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(clampWidgetHitRect({ x: -5, y: 80, width: 50, height: 30 }, { width: 320, height: 90 }))
      .toEqual({ x: 0, y: 80, width: 45, height: 10 });
    expect(clampWidgetHitRect({ x: 0, y: 0, width: 0, height: 10 }, { width: 320, height: 90 }))
      .toBeNull();
  });
});

describe('Linux no-tray stale main window', () => {
  it('recreates when the ref is missing, destroyed, or X-unmapped (zombie)', () => {
    expect(linuxNoTrayFocusAction({ hasWindow: false, isDestroyed: false, xWindowMapped: true })).toBe('recreate');
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: true, xWindowMapped: true })).toBe('recreate');
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: false, xWindowMapped: false })).toBe('recreate');
  });

  it('focuses a live mapped window and does not recreate when the probe is unavailable', () => {
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: false, xWindowMapped: true })).toBe('focus-existing');
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: false, xWindowMapped: null })).toBe('focus-existing');
  });

  it('reads the XID and reports mapping via the probe', () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0x1234, 0);
    const win = {
      isDestroyed: () => false,
      getNativeWindowHandle: () => buf,
    };
    expect(readXWindowId(win)).toBe(0x1234);
    const probe = vi.fn((xid: number) => xid === 0x1234);
    expect(linuxXWindowMapped(win, probe)).toBe(true);
    expect(probe).toHaveBeenCalledWith(0x1234);
    expect(linuxXWindowMapped(win, () => false)).toBe(false);
  });
});
