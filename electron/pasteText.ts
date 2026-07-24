import { clipboard } from 'electron';
import { execFile } from 'node:child_process';

// Simulates Ctrl+V in whatever window currently has OS focus. We deliberately
// avoid native modules (robotjs/nut-js) since their prebuilt binaries are
// frequently out of sync with the Electron ABI; PowerShell SendKeys ships
// with Windows and needs no compilation.
function sendCtrlV(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

export async function pasteAtCursor(text: string): Promise<void> {
  if (!text) return;
  const previousClipboard = clipboard.readText();
  clipboard.writeText(text);
  try {
    await sendCtrlV();
  } finally {
    // Give the paste a moment to land before restoring the old clipboard.
    setTimeout(() => clipboard.writeText(previousClipboard), 500);
  }
}
