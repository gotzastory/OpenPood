import { clipboard } from 'electron';
import { execFile } from 'node:child_process';

// Simulates Ctrl+V in whatever window currently has OS focus. We deliberately
// avoid native modules (robotjs/nut-js) since their prebuilt binaries are
// frequently out of sync with the Electron ABI.
//
// Uses keybd_event with virtual-key codes (VK_CONTROL + VK_V) rather than
// WinForms SendKeys("^v"). SendKeys maps the letter "v" through the active
// keyboard layout — with Thai Kedmanee active that is not physical V, so
// Ctrl+V silently does nothing while PowerShell still exits 0.
function sendCtrlV(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativePaste {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  const byte VK_CONTROL = 0x11;
  const byte VK_V = 0x56;
  const uint KEYEVENTF_KEYUP = 0x0002;
  public static void CtrlV() {
    keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
    keybd_event(VK_V, 0, 0, UIntPtr.Zero);
    keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
}
"@
[NativePaste]::CtrlV()
`.trim();
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pasteAtCursor(text: string): Promise<void> {
  if (!text) return;
  const previousClipboard = clipboard.readText();
  clipboard.writeText(text);
  // Let the clipboard OLE server settle before the keystroke.
  await delay(40);
  try {
    await sendCtrlV();
    // Target app needs a beat to consume the paste before we restore.
    await delay(300);
  } finally {
    if (clipboard.readText() === text) clipboard.writeText(previousClipboard);
  }
}
