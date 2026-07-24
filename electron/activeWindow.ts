import { execFile } from 'node:child_process';

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

// Reads the process name owning the foreground window via a small inline
// Win32 P/Invoke script — same PowerShell-shell-out approach as pasteText.ts,
// avoiding native modules whose prebuilt binaries drift from the Electron ABI.
function getForegroundProcessName(): Promise<string> {
  return new Promise((resolve) => {
    const script = `
$sig = @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
Add-Type -TypeDefinition $sig
$hwnd = [Win32]::GetForegroundWindow()
$procId = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
(Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
`.trim();
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      (error, stdout) => {
        if (error) resolve('');
        else resolve(stdout.trim().toLowerCase());
      },
    );
  });
}

export async function getActiveAppCategory(): Promise<AppCategory> {
  const processName = await getForegroundProcessName().catch(() => '');
  for (const [hint, category] of CATEGORY_BY_PROCESS_HINT) {
    if (processName.includes(hint)) return category;
  }
  return 'general';
}
