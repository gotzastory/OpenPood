import { clipboard } from 'electron';
import { sendCtrlV } from './winHost';

// Simulates Ctrl+V in whatever window currently has OS focus. We deliberately
// avoid native modules (robotjs/nut-js) since their prebuilt binaries are
// frequently out of sync with the Electron ABI. The keystroke itself is sent
// by the persistent PowerShell host in winHost.ts.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pasteAtCursor(text: string): Promise<void> {
  if (!text) return;
  const previousClipboard = clipboard.readText();
  clipboard.writeText(text);
  // Let the clipboard OLE server settle before the keystroke.
  await delay(40);
  // On failure the text deliberately stays on the clipboard so the user can
  // still Ctrl+V it by hand — restoring here would silently lose the dictation.
  await sendCtrlV();
  // Target app needs a beat to consume the paste before we restore.
  await delay(300);
  if (clipboard.readText() === text) clipboard.writeText(previousClipboard);
}
