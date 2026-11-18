import { afterEach, describe, expect, it, vi } from 'vitest';

const storeState = vi.hoisted(() => ({ dashboardCloseHintShown: false }));

vi.mock('electron-store', () => ({
  default: class {
    get(key: 'dashboardCloseHintShown') { return storeState[key]; }
    set(key: 'dashboardCloseHintShown', value: boolean) { storeState[key] = value; }
  },
}));

describe('dashboard close hint persistence', () => {
  afterEach(() => {
    storeState.dashboardCloseHintShown = false;
  });

  it('marks the first-close hint as shown only once', async () => {
    const prefs = await import('./lifecyclePrefs');
    prefs.resetDashboardCloseHintForTests();
    expect(prefs.isDashboardCloseHintShown()).toBe(false);
    prefs.markDashboardCloseHintShown();
    expect(prefs.isDashboardCloseHintShown()).toBe(true);
    prefs.markDashboardCloseHintShown();
    expect(prefs.isDashboardCloseHintShown()).toBe(true);
  });
});
