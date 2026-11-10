import { spawn } from 'node:child_process';
import { clipboard, type Data } from 'electron';
import { RUNTIME } from '../src/lib/runtimeConfig';
import { isLinux, isMac, isWayland } from './platform';

export interface PosixPasteResult {
  pasted: boolean;
  reason?: 'paste-failed' | 'clipboard-preserved' | 'injection-unavailable';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotClipboard(): Data {
  const formats = clipboard.availableFormats();
  const supported = new Set(['text/plain', 'text/html', 'text/rtf', 'image/png', 'image/jpeg', 'image/bmp']);
  if (formats.some((format) => !supported.has(format))) throw new Error('unsupported clipboard format');
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

function run(command: string, args: string[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const onAbort = () => {
      child.kill();
      reject(new Error('paste cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code ?? 'signal'}`));
    });
  });
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await run('sh', ['-c', `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

/** Exported for unit tests without spawning OS tools. */
export async function injectPasteKeystroke(options?: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  runCommand?: typeof run;
  hasCommand?: typeof commandAvailable;
  signal?: AbortSignal;
}): Promise<'pasted' | 'injection-unavailable'> {
  const platform = options?.platform ?? process.platform;
  const env = options?.env ?? process.env;
  const runCommand = options?.runCommand ?? run;
  const hasCommand = options?.hasCommand ?? commandAvailable;
  const signal = options?.signal;

  if (isMac(platform)) {
    // Requires Accessibility permission for the app.
    await runCommand('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], signal);
    return 'pasted';
  }

  if (!isLinux(platform)) throw new Error('unsupported platform');

  if (isWayland(env)) {
    if (await hasCommand('wtype')) {
      await runCommand('wtype', ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl'], signal);
      return 'pasted';
    }
    if (await hasCommand('ydotool')) {
      // LeftCtrl down, V down, V up, LeftCtrl up (key codes from input-event-codes.h).
      await runCommand('ydotool', ['key', '29:1', '47:1', '47:0', '29:0'], signal);
      return 'pasted';
    }
    return 'injection-unavailable';
  }

  if (await hasCommand('xdotool')) {
    await runCommand('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], signal);
    return 'pasted';
  }
  return 'injection-unavailable';
}

/**
 * Clipboard-first paste for macOS and Linux. On Wayland (or missing tools),
 * leave the transcript on the clipboard so the user can press Ctrl+V manually.
 */
export async function pastePosix(
  text: string,
  signal?: AbortSignal,
  inject: typeof injectPasteKeystroke = injectPasteKeystroke,
): Promise<PosixPasteResult> {
  signal?.throwIfAborted();
  let previous: Data | undefined;
  try {
    previous = snapshotClipboard();
  } catch {
    // Unsupported/custom formats: still place the transcript so it is recoverable.
    previous = undefined;
  }
  signal?.throwIfAborted();
  clipboard.writeText(text);
  if (clipboard.readText() !== text) return { pasted: false, reason: 'clipboard-preserved' };

  let sent = false;
  const restoreIfOwned = () => {
    if (!previous) return;
    if (clipboard.readText() === text) clipboard.write(previous);
  };

  try {
    await delay(RUNTIME.clipboardSettleMs);
    signal?.throwIfAborted();
    const result = await inject({ signal });
    if (result === 'injection-unavailable') {
      // Keep transcript on the clipboard for manual paste. Do not restore previous.
      return { pasted: false, reason: 'injection-unavailable' };
    }
    sent = true;
    await delay(RUNTIME.clipboardRestoreMs);
    restoreIfOwned();
    return { pasted: true };
  } catch {
    if (signal?.aborted && !sent) {
      try { restoreIfOwned(); } catch { /* ignore */ }
      signal.throwIfAborted();
    }
    // Keep the transcript on the clipboard after a failed injection.
    return sent ? { pasted: true } : { pasted: false, reason: 'paste-failed' };
  }
}
