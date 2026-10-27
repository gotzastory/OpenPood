import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { POWERSHELL_EXE } from './powershell';

// One long-lived powershell.exe that compiles the Win32 P/Invoke class once
// and then serves requests over stdin/stdout. Before this, every dictation
// spawned PowerShell twice (foreground-window lookup + Ctrl+V), each paying
// an Add-Type C# compile (~0.3-0.8 s). Still no native modules — see
// pasteText.ts for why robotjs/nut-js are avoided.
//
// Line protocol (the host executes commands sequentially, FIFO):
//   "<id> fg"    -> "<id> ok <hwnd> <processName>"
//   "<id> paste <hwnd> <sequence>" -> "<id> ok pasted|focus-changed|clipboard-changed"
//   "<id> clipboard" -> "<id> ok <sequence> <flags>" (files=1, unsupported=2, nonempty=4)
//   anything     -> "<id> err <message>"

export interface ForegroundWindow {
  /** Window handle as a decimal string; '0' when unknown. */
  hwnd: string;
  /** Lowercased process name without .exe; '' when unknown. */
  processName: string;
}

const REQUEST_TIMEOUT_MS = 5000;
const READY_TIMEOUT_MS = 15000;

// SendInput with virtual-key codes rather than WinForms SendKeys("^v"):
// SendKeys maps the letter "v" through the active keyboard layout — with Thai
// Kedmanee active that is not physical V, so Ctrl+V silently does nothing.
const HOST_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class OpenPoodNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] public static extern bool IsClipboardFormatAvailable(uint format);
  [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr owner);
  [DllImport("user32.dll")] static extern bool CloseClipboard();
  [DllImport("user32.dll", SetLastError=true)] static extern uint EnumClipboardFormats(uint format);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClipboardFormatName(uint format, StringBuilder name, int size);
  [DllImport("kernel32.dll")] static extern void SetLastError(uint error);
  public static int ClipboardFlags() {
    if (!OpenClipboard(IntPtr.Zero)) throw new InvalidOperationException("clipboard unavailable");
    try {
      int flags = 0;
      uint format = 0;
      while (true) {
        SetLastError(0);
        format = EnumClipboardFormats(format);
        if (format == 0) {
          if (Marshal.GetLastWin32Error() != 0) throw new InvalidOperationException("clipboard enumeration failed");
          return flags;
        }
        flags |= 4;
        if (format == 15) flags |= 1;
        // Text encodings/locale and raster image formats can be restored via Electron.
        if (format == 1 || format == 2 || format == 7 || format == 8 || format == 9 || format == 13 || format == 16 || format == 17) continue;
        var name = new StringBuilder(256);
        GetClipboardFormatName(format, name, name.Capacity);
        string value = name.ToString();
        if (value == "HTML Format" || value == "Rich Text Format" || value == "PNG" || value == "JFIF") continue;
        // Provenance-only tags Chromium/Electron add to every copy; losing them on restore is harmless.
        if (value == "Chromium internal source URL" || value == "Chromium internal source RFH token") continue;
        flags |= 2;
      }
    } finally { CloseClipboard(); }
  }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort vk; public ushort scan; public uint flags; public uint time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int x; public int y; public uint data; public uint flags; public uint time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION data; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  const ushort VK_CONTROL = 0x11;
  const ushort VK_V = 0x56;
  const uint KEYEVENTF_KEYUP = 0x0002;
  public static void CtrlV() {
    INPUT[] inputs = new INPUT[4];
    ushort[] keys = new ushort[] { VK_CONTROL, VK_V, VK_V, VK_CONTROL };
    for (int i = 0; i < inputs.Length; i++) {
      inputs[i].type = 1;
      inputs[i].data.keyboard.vk = keys[i];
      inputs[i].data.keyboard.flags = i < 2 ? 0 : KEYEVENTF_KEYUP;
    }
    if (SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT))) != 4) {
      // Best effort release after a partial injection to avoid a stuck Ctrl key.
      SendInput(2, new INPUT[] { inputs[2], inputs[3] }, Marshal.SizeOf(typeof(INPUT)));
      throw new InvalidOperationException("input injection blocked");
    }
  }
}
"@
$out = [Console]::Out
$out.WriteLine("ready")
$out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split(' ', 2)
  $id = $parts[0]
  $cmd = if ($parts.Length -gt 1) { $parts[1] } else { '' }
  try {
    $commandParts = $cmd.Split(' ')
    switch ($commandParts[0]) {
      'fg' {
        $hwnd = [OpenPoodNative]::GetForegroundWindow()
        $procId = [uint32]0
        [OpenPoodNative]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
        $name = ''
        try { $name = [System.Diagnostics.Process]::GetProcessById([int]$procId).ProcessName } catch {}
        $out.WriteLine("$id ok $([int64]$hwnd) $name")
      }
      'paste' {
        if ($commandParts.Length -ne 3 -or $commandParts[1] -notmatch '^[1-9][0-9]*$' -or $commandParts[2] -notmatch '^[0-9]+$') { throw 'invalid paste target' }
        if ([OpenPoodNative]::GetClipboardSequenceNumber() -ne [uint32]$commandParts[2]) {
          $out.WriteLine("$id ok clipboard-changed")
          break
        }
        if ([OpenPoodNative]::GetForegroundWindow().ToInt64() -ne [int64]$commandParts[1]) {
          $out.WriteLine("$id ok focus-changed")
          break
        }
        [OpenPoodNative]::CtrlV()
        $out.WriteLine("$id ok pasted")
      }
      'clipboard' {
        $sequence = [OpenPoodNative]::GetClipboardSequenceNumber()
        $flags = [OpenPoodNative]::ClipboardFlags()
        $out.WriteLine("$id ok $sequence $flags")
      }
      default { $out.WriteLine("$id err unknown command") }
    }
  } catch {
    $out.WriteLine("$id err $($_.Exception.Message -replace '[\\r\\n]+', ' ')")
  }
  $out.Flush()
}
`.trim();

interface Pending {
  resolve: (payload: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  cleanup: () => void;
}

let child: ChildProcessWithoutNullStreams | null = null;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let disposed = false;

function failAll(err: Error) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.cleanup();
    p.reject(err);
  }
  pending.clear();
}

function killChild() {
  const c = child;
  child = null;
  readyPromise = null;
  if (c && c.exitCode === null) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
}

function handleLine(line: string) {
  const sp = line.indexOf(' ');
  const idStr = sp === -1 ? line : line.slice(0, sp);
  const rest = sp === -1 ? '' : line.slice(sp + 1);
  const id = Number(idStr);
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  p.cleanup();
  if (rest === 'ok' || rest.startsWith('ok ')) {
    p.resolve(rest.slice(3));
  } else {
    p.reject(new Error(rest.startsWith('err ') ? rest.slice(4) : `unexpected host reply: ${line}`));
  }
}

function ensureHost(): Promise<void> {
  if (readyPromise) return readyPromise;
  if (disposed) return Promise.reject(new Error('win host disposed'));

  readyPromise = new Promise<void>((resolve, reject) => {
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(
        POWERSHELL_EXE,
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', HOST_SCRIPT],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (err) {
      readyPromise = null;
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    child = proc;

    let ready = false;
    const readyTimer = setTimeout(() => {
      if (!ready) {
        reject(new Error('win host did not become ready'));
        if (child === proc) killChild();
      }
    }, READY_TIMEOUT_MS);

    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!ready) {
          if (line === 'ready') {
            ready = true;
            clearTimeout(readyTimer);
            resolve();
          }
          continue;
        }
        handleLine(line);
      }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      console.error('[winHost]', chunk.trim());
    });

    const onGone = (err: Error) => {
      clearTimeout(readyTimer);
      if (!ready) reject(err);
      if (child === proc) {
        child = null;
        readyPromise = null;
        failAll(err);
      }
    };
    proc.on('error', (err) => onGone(err));
    proc.on('exit', (code) => onGone(new Error(`win host exited (${code ?? 'signal'})`)));
  });

  return readyPromise;
}

async function request(cmd: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  await ensureHost();
  signal?.throwIfAborted();
  const proc = child;
  if (!proc) throw new Error('win host unavailable');
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      failAll(new Error('win host timeout'));
      // A wedged host is worse than a cold one — drop it, next call respawns.
      if (child === proc) killChild();
    }, REQUEST_TIMEOUT_MS);
    const onAbort = () => {
      if (!pending.has(id)) return;
      failAll(new Error('win host request cancelled'));
      if (child === proc) killChild();
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    pending.set(id, { resolve, reject, timer, cleanup });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    proc.stdin.write(`${id} ${cmd}\n`, (err) => {
      if (err) {
        pending.delete(id);
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    });
  });
}

/** Spawn the host ahead of the first dictation so it never pays the compile on the hot path. */
export function warmWinHost(): void {
  ensureHost().catch((err) => console.error('[winHost] warm-up failed:', err));
}

export async function getForegroundWindow(): Promise<ForegroundWindow> {
  const payload = await request('fg');
  const sp = payload.indexOf(' ');
  const hwnd = (sp === -1 ? payload : payload.slice(0, sp)).trim() || '0';
  const processName = (sp === -1 ? '' : payload.slice(sp + 1)).trim().toLowerCase();
  return { hwnd, processName };
}

export async function sendCtrlV(expectedHwnd: string, sequence: string, signal?: AbortSignal): Promise<'pasted' | 'focus-changed' | 'clipboard-changed'> {
  if (!/^[1-9]\d*$/.test(expectedHwnd) || !/^\d+$/.test(sequence)) throw new Error('invalid paste target');
  const result = await request(`paste ${expectedHwnd} ${sequence}`, signal);
  if (result !== 'pasted' && result !== 'focus-changed' && result !== 'clipboard-changed') throw new Error('invalid paste reply');
  return result;
}

export async function getClipboardState(signal?: AbortSignal): Promise<{ sequence: string; hasFiles: boolean; hasUnsupported: boolean; hasFormats: boolean }> {
  const result = await request('clipboard', signal);
  const match = /^(\d+) ([0-7])$/.exec(result);
  if (!match) throw new Error('invalid clipboard reply');
  const flags = Number(match[2]);
  return { sequence: match[1], hasFiles: (flags & 1) !== 0, hasUnsupported: (flags & 2) !== 0, hasFormats: (flags & 4) !== 0 };
}

export function disposeWinHost(): void {
  disposed = true;
  failAll(new Error('win host disposed'));
  killChild();
}
