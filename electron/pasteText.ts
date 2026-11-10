import type { ForegroundWindow } from './winHost';
import { isWindows } from './platform';
import { pastePosix, type PosixPasteResult } from './posixPaste';
import { pasteWindows, type WindowsPasteResult } from './pasteWindows';

export type PasteResult = WindowsPasteResult | PosixPasteResult;

export type { ForegroundWindow };

/** Paste transcribed text into the previously focused application. */
export async function pasteAtCursor(
  text: string,
  target: ForegroundWindow | null,
  signal?: AbortSignal,
): Promise<PasteResult> {
  if (isWindows()) return pasteWindows(text, target, signal);
  return pastePosix(text, signal);
}
