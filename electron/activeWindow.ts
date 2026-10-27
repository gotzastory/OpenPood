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

// User-defined override for one app. `process` is matched the same way as the
// built-in hints above; an empty `tone` keeps the built-in category hint.
export interface AppProfile {
  process: string;
  polish: boolean;
  tone: string;
}

const MAX_APP_PROFILES = 50;
const MAX_PROCESS_CHARS = 64;
const MAX_TONE_CHARS = 500;

// Profiles arrive over IPC from the renderer — keep only well-typed entries
// with a usable, unique process name.
export function sanitizeAppProfiles(input: unknown): AppProfile[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const profiles: AppProfile[] = [];
  for (const item of input) {
    if (profiles.length >= MAX_APP_PROFILES) break;
    if (typeof item !== 'object' || item === null) continue;
    const { process, polish, tone } = item as Record<string, unknown>;
    if (typeof process !== 'string' || typeof polish !== 'boolean' || typeof tone !== 'string') continue;
    const name = process.trim().toLowerCase().replace(/\.exe$/, '');
    if (!name || name.length > MAX_PROCESS_CHARS || seen.has(name)) continue;
    seen.add(name);
    profiles.push({ process: name, polish, tone: tone.trim().slice(0, MAX_TONE_CHARS) });
  }
  return profiles;
}

export function profileForProcess(profiles: AppProfile[], processName: string): AppProfile | undefined {
  const name = processName.toLowerCase();
  if (!name) return undefined;
  return profiles.find((profile) => name.includes(profile.process));
}
