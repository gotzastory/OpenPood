import { clipboard } from 'electron';
import { execFile } from 'node:child_process';

// Simulates Ctrl+C in whatever window currently has OS focus — mirror of
// pasteText.ts. Uses virtual-key keybd_event (not WinForms SendKeys) so it
// still works when the Thai keyboard layout is active.
function sendCtrlC(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativeCopy {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  const byte VK_CONTROL = 0x11;
  const byte VK_C = 0x43;
  const uint KEYEVENTF_KEYUP = 0x0002;
  public static void CtrlC() {
    keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
    keybd_event(VK_C, 0, 0, UIntPtr.Zero);
    keybd_event(VK_C, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
}
"@
[NativeCopy]::CtrlC()
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

// Reads whatever text is currently selected in the foreground app (used by
// Ask anything to grab context for the voice question). Clears the clipboard
// first so an empty result after Ctrl+C reliably means "nothing selected"
// rather than stale clipboard content, then restores the user's previous
// clipboard immediately — the final answer gets its own copy/paste cycle.
export async function readSelectedText(): Promise<string> {
  const previousClipboard = clipboard.readText();
  clipboard.clear();
  try {
    await sendCtrlC();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return clipboard.readText();
  } catch {
    return '';
  } finally {
    clipboard.writeText(previousClipboard);
  }
}
