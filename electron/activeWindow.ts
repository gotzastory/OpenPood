export type AppCategory = 'email' | 'chat' | 'code' | 'browser' | 'general';

// Matched against the foreground process name (lowercased, no .exe) via
// substring — good enough to distinguish the handful of app categories we
// adjust tone for, without needing an exhaustive process list.
const CATEGORY_BY_PROCESS_HINT: [string, AppCategory][] = [
  ['outlook', 'email'],
  ['thunderbird', 'email'],
  ['slack', 'chat'],
  ['discord', 'chat'],
  ['teams', 'chat'],
  ['line', 'chat'],
  ['telegram', 'chat'],
  ['whatsapp', 'chat'],
  ['messenger', 'chat'],
  ['code', 'code'],
  ['devenv', 'code'],
  ['pycharm', 'code'],
  ['idea64', 'code'],
  ['sublime_text', 'code'],
  ['notepad++', 'code'],
  ['cursor', 'code'],
  ['chrome', 'browser'],
  ['firefox', 'browser'],
  ['msedge', 'browser'],
  ['brave', 'browser'],
];

// The process name itself comes from winHost.ts `getForegroundWindow()`,
// captured at hotkey press so this never costs a round-trip on the hot path.
export function categoryForProcess(processName: string): AppCategory {
  const name = processName.toLowerCase();
  for (const [hint, category] of CATEGORY_BY_PROCESS_HINT) {
    if (name.includes(hint)) return category;
  }
  return 'general';
}
