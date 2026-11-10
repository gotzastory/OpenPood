import Store from 'electron-store';

type LifecyclePrefs = {
  dashboardCloseHintShown: boolean;
};

/** Lazy so tests that never touch prefs do not need Electron userData. */
let store: Store<LifecyclePrefs> | null = null;

function prefs(): Store<LifecyclePrefs> {
  if (!store) {
    store = new Store<LifecyclePrefs>({
      name: 'lifecycle',
      defaults: { dashboardCloseHintShown: false },
    });
  }
  return store;
}

export function isDashboardCloseHintShown(): boolean {
  return prefs().get('dashboardCloseHintShown');
}

export function markDashboardCloseHintShown(): void {
  prefs().set('dashboardCloseHintShown', true);
}

/** Test helper — resets the in-memory/store flag between cases. */
export function resetDashboardCloseHintForTests(): void {
  prefs().set('dashboardCloseHintShown', false);
}
