import path from 'node:path';

// Absolute path so resolution never depends on PATH (removes the PATH-hijack
// class entirely). Windows-only app, so hardcoding the System32 layout is fine.
export const POWERSHELL_EXE = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);
