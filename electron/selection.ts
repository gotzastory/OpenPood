import { clipboard } from 'electron';
import { execFile } from 'node:child_process';

// Simulates Ctrl+C in whatever window currently has OS focus — the mirror
// image of pasteText.ts's Ctrl+V simulation, same PowerShell SendKeys
// approach (no native modules to keep in sync with the Electron ABI).
function sendCtrlC(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')";
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
