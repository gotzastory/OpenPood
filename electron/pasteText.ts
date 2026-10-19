import { clipboard, type Data } from 'electron';
import { getClipboardState, sendCtrlV, type ForegroundWindow } from './winHost';
import { RUNTIME } from '../src/lib/runtimeConfig';

export interface PasteResult {
  pasted: boolean;
  reason?: 'focus-changed' | 'paste-failed' | 'clipboard-preserved';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotClipboard(hasNativeFormats: boolean): Data {
  const formats = clipboard.availableFormats();
  const supported = new Set(['text/plain', 'text/html', 'text/rtf', 'image/png', 'image/jpeg', 'image/bmp']);
  // Native file drops/custom formats cannot be faithfully restored through the
  // installed Electron API. Never destroy them to perform automatic dictation.
  if (formats.some((format) => !supported.has(format))) throw new Error('unsupported clipboard format');
  if (hasNativeFormats && formats.length === 0) throw new Error('unexposed clipboard format');
  const data: Data = {};
  let bytes = 0;
  if (formats.includes('text/plain')) data.text = clipboard.readText();
  if (formats.includes('text/html')) data.html = clipboard.readHTML();
  if (formats.includes('text/rtf')) data.rtf = clipboard.readRTF();
  for (const text of [data.text, data.html, data.rtf]) bytes += Buffer.byteLength(text ?? '');
  if (formats.some((format) => format.startsWith('image/'))) {
    const image = clipboard.readImage();
    if (image.isEmpty()) throw new Error('unreadable clipboard image');
    const { width, height } = image.getSize();
    bytes += width * height * 4;
    data.image = image;
  }
  if (bytes > RUNTIME.maxClipboardBytes) throw new Error('clipboard snapshot too large');
  return data;
}

export async function pasteAtCursor(text: string, target: ForegroundWindow | null, signal?: AbortSignal): Promise<PasteResult> {
  signal?.throwIfAborted();
  let previous: Data;
  try {
    const before = await getClipboardState(signal);
    if (before.hasFiles || before.hasUnsupported) return { pasted: false, reason: 'clipboard-preserved' };
    previous = snapshotClipboard(before.hasFormats);
    const after = await getClipboardState(signal);
    if (after.sequence !== before.sequence) return { pasted: false, reason: 'clipboard-preserved' };
  } catch {
    signal?.throwIfAborted();
    return { pasted: false, reason: 'clipboard-preserved' };
  }
  signal?.throwIfAborted();
  clipboard.writeText(text);
  let ownedSequence: string | undefined;
  let sent = false;
  const restoreIfOwned = async () => {
    if (!ownedSequence) return;
    const current = await getClipboardState();
    if (current.sequence === ownedSequence && clipboard.readText() === text) clipboard.write(previous);
  };
  try {
    const written = await getClipboardState();
    ownedSequence = written.sequence;
    signal?.throwIfAborted();
    // Check content too: another application could change clipboard while the
    // host request is in flight. Recheck sequence in native code at injection.
    if (clipboard.readText() !== text || written.hasFiles || written.hasUnsupported) return { pasted: false, reason: 'clipboard-preserved' };
    if (!target || !/^[1-9]\d*$/.test(target.hwnd)) return { pasted: false, reason: 'focus-changed' };
    await delay(RUNTIME.clipboardSettleMs);
    signal?.throwIfAborted();
    const result = await sendCtrlV(target.hwnd, ownedSequence, signal);
    if (result === 'clipboard-changed') return { pasted: false, reason: 'clipboard-preserved' };
    if (result === 'focus-changed') return { pasted: false, reason: 'focus-changed' };
    sent = true;
    // There is no universal acknowledgement from arbitrary desktop apps.
    // Keep a configurable grace period and never overwrite a subsequent copy.
    await delay(RUNTIME.clipboardRestoreMs);
    await restoreIfOwned();
    return { pasted: true };
  } catch {
    if (signal?.aborted && !sent) {
      await restoreIfOwned().catch(() => undefined);
      signal.throwIfAborted();
    }
    // An injected paste cannot be retracted. Restoration failure is separate
    // from delivery failure; in both cases keep the transcript recoverable.
    return sent ? { pasted: true } : { pasted: false, reason: 'paste-failed' };
  }
}
