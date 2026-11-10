import { describe, expect, it } from 'vitest';
import { shouldExitLosingInstance, windowCloseAction } from './windowLifecycle';

describe('window close policy without tray', () => {
  it('keeps destroying the dashboard when a tray can reopen it', () => {
    expect(windowCloseAction(true)).toBe('destroy-keep-running');
  });

  it('minimizes instead of destroying when the tray is unavailable', () => {
    expect(windowCloseAction(false)).toBe('minimize');
  });
});

describe('single-instance lock ownership', () => {
  it('exits the losing instance so AppImage relaunches signal the first process', () => {
    expect(shouldExitLosingInstance(false)).toBe(true);
    expect(shouldExitLosingInstance(true)).toBe(false);
  });
});
