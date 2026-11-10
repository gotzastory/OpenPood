import { spawnSync } from 'node:child_process';
import { isLinux } from './platform';

/** What to do when the dashboard window would close. */
export type WindowCloseAction = 'destroy-keep-running' | 'minimize';

export type SecondInstanceAction = 'create' | 'focus-existing';

/**
 * With a confirmed tray, closing the dashboard keeps the app (widget/hotkeys) alive.
 * Without a confirmed tray there is no reopen affordance — minimize to the taskbar.
 */
export function windowCloseAction(trayConfirmed: boolean): WindowCloseAction {
  return trayConfirmed ? 'destroy-keep-running' : 'minimize';
}

/**
 * Linux: never treat `new Tray()` succeeding as proof a tray host exists.
 * Require a positive StatusNotifierWatcher signal (or leave unconfirmed).
 * Windows / macOS: construction success is enough.
 */
export function resolveTrayConfirmed(input: {
  platform: NodeJS.Platform;
  trayConstructed: boolean;
  linuxStatusNotifierPresent?: boolean;
}): boolean {
  if (isLinux(input.platform)) {
    return input.trayConstructed && input.linuxStatusNotifierPresent === true;
  }
  return input.trayConstructed;
}

/** Cold start opens the dashboard unless a tray is confirmed to reopen it. */
export function shouldOpenMainWindowOnColdStart(trayConfirmed: boolean): boolean {
  return !trayConfirmed;
}

/**
 * Second launches must recreate a missing/destroyed dashboard, otherwise focus it.
 */
export function secondInstanceAction(windowState: 'absent' | 'alive'): SecondInstanceAction {
  return windowState === 'alive' ? 'focus-existing' : 'create';
}

/** Whether a second process should exit after failing to take the single-instance lock. */
export function shouldExitLosingInstance(gotLock: boolean): boolean {
  return !gotLock;
}

type DbusRunner = (command: string, args: readonly string[]) => {
  status: number | null;
  stdout: string;
};

function defaultDbusRunner(command: string, args: readonly string[]) {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    timeout: 500,
    env: process.env,
  });
  return { status: result.status, stdout: result.stdout ?? '' };
}

/**
 * Cheap session-bus probe for a StatusNotifier host.
 * Missing dbus-send / timeout / false → unconfirmed (safe default).
 */
export function linuxStatusNotifierPresent(run: DbusRunner = defaultDbusRunner): boolean {
  try {
    const result = run('dbus-send', [
      '--session',
      '--dest=org.freedesktop.DBus',
      '--type=method_call',
      '--print-reply',
      '--reply-timeout=500',
      '/org/freedesktop/DBus',
      'org.freedesktop.DBus.NameHasOwner',
      'string:org.kde.StatusNotifierWatcher',
    ]);
    if (result.status !== 0) return false;
    return /boolean\s+true/.test(result.stdout);
  } catch {
    return false;
  }
}
