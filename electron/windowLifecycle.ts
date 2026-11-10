/** What to do when the dashboard window would close. */
export type WindowCloseAction = 'destroy-keep-running' | 'minimize';

/**
 * With a working tray, closing the dashboard keeps the app (widget/hotkeys) alive.
 * Without a tray there is no reopen affordance — minimize to the taskbar instead of
 * destroying the window (or leaving a headless process with no UI).
 */
export function windowCloseAction(trayAvailable: boolean): WindowCloseAction {
  return trayAvailable ? 'destroy-keep-running' : 'minimize';
}

/** Whether a second process should exit after failing to take the single-instance lock. */
export function shouldExitLosingInstance(gotLock: boolean): boolean {
  return !gotLock;
}
