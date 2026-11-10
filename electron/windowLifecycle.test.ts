import { describe, expect, it } from 'vitest';
import {
  linuxStatusNotifierPresent,
  resolveTrayConfirmed,
  secondInstanceAction,
  shouldExitLosingInstance,
  shouldOpenMainWindowOnColdStart,
  windowCloseAction,
} from './windowLifecycle';

describe('window close policy', () => {
  it('allows close when a tray is confirmed (app stays via tray)', () => {
    expect(windowCloseAction(true, 'win32')).toBe('destroy-keep-running');
    expect(windowCloseAction(true, 'linux')).toBe('destroy-keep-running');
  });

  it('minimizes on Windows/mac without a tray so the taskbar can restore', () => {
    expect(windowCloseAction(false, 'win32')).toBe('minimize');
    expect(windowCloseAction(false, 'darwin')).toBe('minimize');
  });

  it('allows real close on Linux without a confirmed tray (no minimize zombie)', () => {
    expect(windowCloseAction(false, 'linux')).toBe('destroy-keep-running');
  });

  it('never treats Linux Tray construction alone as confirmation', () => {
    expect(resolveTrayConfirmed({
      platform: 'linux',
      trayConstructed: true,
      linuxStatusNotifierPresent: false,
    })).toBe(false);
    expect(resolveTrayConfirmed({
      platform: 'linux',
      trayConstructed: true,
    })).toBe(false);
    expect(resolveTrayConfirmed({
      platform: 'linux',
      trayConstructed: true,
      linuxStatusNotifierPresent: true,
    })).toBe(true);
  });

  it('keeps Windows and macOS confirmation tied to successful Tray construction', () => {
    expect(resolveTrayConfirmed({ platform: 'win32', trayConstructed: true })).toBe(true);
    expect(resolveTrayConfirmed({ platform: 'darwin', trayConstructed: true })).toBe(true);
    expect(resolveTrayConfirmed({ platform: 'win32', trayConstructed: false })).toBe(false);
  });
});

describe('cold-start dashboard visibility', () => {
  it('opens the main window when the tray is unconfirmed (typical Linux XFCE)', () => {
    expect(shouldOpenMainWindowOnColdStart(false)).toBe(true);
  });

  it('skips the cold-start dashboard when a tray is confirmed', () => {
    expect(shouldOpenMainWindowOnColdStart(true)).toBe(false);
  });
});

describe('second-instance create-or-focus', () => {
  it('creates when the dashboard is missing or was destroyed', () => {
    expect(secondInstanceAction('absent')).toBe('create');
  });

  it('focuses an existing alive dashboard', () => {
    expect(secondInstanceAction('alive')).toBe('focus-existing');
  });
});

describe('single-instance lock ownership', () => {
  it('exits the losing instance so AppImage relaunches signal the first process', () => {
    expect(shouldExitLosingInstance(false)).toBe(true);
    expect(shouldExitLosingInstance(true)).toBe(false);
  });
});

describe('linux StatusNotifierWatcher probe', () => {
  it('returns true only when dbus reports the name is owned', () => {
    expect(linuxStatusNotifierPresent(() => ({
      status: 0,
      stdout: 'method return time=1.0\n   boolean true\n',
    }))).toBe(true);
    expect(linuxStatusNotifierPresent(() => ({
      status: 0,
      stdout: 'method return time=1.0\n   boolean false\n',
    }))).toBe(false);
    expect(linuxStatusNotifierPresent(() => ({ status: 1, stdout: '' }))).toBe(false);
  });
});
