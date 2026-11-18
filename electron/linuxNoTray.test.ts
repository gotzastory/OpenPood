import { describe, expect, it, vi } from 'vitest';
import {
  clampWidgetHitRect,
  interpretXwininfoResult,
  linuxNoTrayFocusAction,
  linuxXWindowMapped,
  readXWindowId,
  resolveElectronOzonePlatform,
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

describe('ozone platform resolution', () => {
  it('honors explicit ozone-platform and ELECTRON_OZONE_PLATFORM_HINT', () => {
    expect(resolveElectronOzonePlatform({ ozoneSwitch: 'x11' })).toBe('x11');
    expect(resolveElectronOzonePlatform({ ozoneSwitch: 'wayland' })).toBe('wayland');
    expect(resolveElectronOzonePlatform({ ozoneHint: 'x11' })).toBe('x11');
    expect(resolveElectronOzonePlatform({ ozoneSwitch: 'auto', ozoneHint: 'wayland', env: {} })).toBe('unknown');
  });

  it('resolves auto/empty like Chromium (wayland if WAYLAND_DISPLAY, else x11 if DISPLAY)', () => {
    expect(resolveElectronOzonePlatform({
      ozoneSwitch: 'auto',
      env: { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' },
    })).toBe('wayland');
    expect(resolveElectronOzonePlatform({
      ozoneSwitch: '',
      env: { DISPLAY: ':0' },
    })).toBe('x11');
    expect(resolveElectronOzonePlatform({ ozoneSwitch: 'auto', env: {} })).toBe('unknown');
  });
});

describe('xwininfo interpretation', () => {
  it('maps only BadWindow to false and treats other failures as unknown', () => {
    expect(interpretXwininfoResult({ status: 0, stderr: '' })).toBe(true);
    expect(interpretXwininfoResult({
      status: 1,
      stderr: "xwininfo: error: unable to get window id ''\nX Error of failed request:  BadWindow (invalid Window parameter)\n",
    })).toBe(false);
    expect(interpretXwininfoResult({
      status: 1,
      stderr: 'xwininfo: error: unable to open display\n',
    })).toBeNull();
    expect(interpretXwininfoResult({
      status: null,
      error: Object.assign(new Error('not found'), { code: 'ENOENT' }),
    })).toBeNull();
    expect(interpretXwininfoResult({
      status: null,
      error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
      signal: 'SIGTERM',
    })).toBeNull();
  });
});

describe('Linux no-tray stale main window', () => {
  it('recreates when the ref is missing/destroyed, or X11 BadWindow is confirmed', () => {
    expect(linuxNoTrayFocusAction({ hasWindow: false, isDestroyed: false, xWindowMapped: true })).toBe('recreate');
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: true, xWindowMapped: true })).toBe('recreate');
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: false, xWindowMapped: false })).toBe('recreate');
  });

  it('focuses when mapped, unknown, wayland, or probe unavailable', () => {
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: false, xWindowMapped: true })).toBe('focus-existing');
    expect(linuxNoTrayFocusAction({ hasWindow: true, isDestroyed: false, xWindowMapped: null })).toBe('focus-existing');
  });

  it('x11+BadWindow -> recreate path; x11+mapped -> focus; never probes off x11', () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0x1234, 0);
    const win = {
      isDestroyed: () => false,
      getNativeWindowHandle: () => buf,
    };
    expect(readXWindowId(win)).toBe(0x1234);

    const probe = vi.fn(() => false);
    expect(linuxXWindowMapped(win, 'x11', probe)).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
    expect(linuxNoTrayFocusAction({
      hasWindow: true,
      isDestroyed: false,
      xWindowMapped: false,
    })).toBe('recreate');

    probe.mockClear();
    probe.mockReturnValue(true);
    expect(linuxXWindowMapped(win, 'x11', probe)).toBe(true);
    expect(linuxNoTrayFocusAction({
      hasWindow: true,
      isDestroyed: false,
      xWindowMapped: true,
    })).toBe('focus-existing');

    probe.mockClear();
    expect(linuxXWindowMapped(win, 'wayland', probe)).toBeNull();
    expect(probe).not.toHaveBeenCalled();
    expect(linuxXWindowMapped(win, 'unknown', probe)).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('auto with WAYLAND_DISPLAY is not x11, so mapping stays unknown (focus-only)', () => {
    expect(resolveElectronOzonePlatform({
      ozoneSwitch: 'auto',
      env: { WAYLAND_DISPLAY: 'wayland-1' },
    })).toBe('wayland');
    const win = {
      isDestroyed: () => false,
      getNativeWindowHandle: () => Buffer.alloc(8),
    };
    const probe = vi.fn(() => false);
    expect(linuxXWindowMapped(win, 'wayland', probe)).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('XID null / ENOENT / timeout / non-BadWindow -> unknown (focus-only)', () => {
    const empty = {
      isDestroyed: () => false,
      getNativeWindowHandle: () => Buffer.alloc(0),
    };
    const probe = vi.fn(() => false);
    expect(linuxXWindowMapped(empty, 'x11', probe)).toBeNull();
    expect(probe).not.toHaveBeenCalled();

    expect(interpretXwininfoResult({
      status: null,
      error: Object.assign(new Error('missing'), { code: 'ENOENT' }),
    })).toBeNull();
    expect(interpretXwininfoResult({
      status: null,
      signal: 'SIGTERM',
      error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    })).toBeNull();
    expect(interpretXwininfoResult({ status: 1, stderr: 'connection refused' })).toBeNull();
  });
});
