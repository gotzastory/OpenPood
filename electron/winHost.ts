import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { POWERSHELL_EXE } from './powershell';

// One long-lived powershell.exe that compiles the Win32 P/Invoke class once
// and then serves requests over stdin/stdout. Before this, every dictation
// spawned PowerShell twice (foreground-window lookup + Ctrl+V), each paying
// an Add-Type C# compile (~0.3-0.8 s). Still no native modules — see
// pasteText.ts for why robotjs/nut-js are avoided.
//
// Line protocol (one request in flight at a time, FIFO):
//   "<id> fg"    -> "<id> ok <hwnd> <processName>"
//   "<id> paste" -> "<id> ok"
//   anything     -> "<id> err <message>"

export interface ForegroundWindow {
  /** Window handle as a decimal string; '0' when unknown. */
  hwnd: string;
  /** Lowercased process name without .exe; '' when unknown. */
  processName: string;
}

const REQUEST_TIMEOUT_MS = 5000;
const READY_TIMEOUT_MS = 15000;

// keybd_event with virtual-key codes rather than WinForms SendKeys("^v"):
// SendKeys maps the letter "v" through the active keyboard layout — with Thai
// Kedmanee active that is not physical V, so Ctrl+V silently does nothing.
const HOST_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class OpenPoodNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
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
    switch ($cmd) {
      'fg' {
        $hwnd = [OpenPoodNative]::GetForegroundWindow()
        $procId = [uint32]0
        [OpenPoodNative]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
        $name = ''
        try { $name = [System.Diagnostics.Process]::GetProcessById([int]$procId).ProcessName } catch {}
        $out.WriteLine("$id ok $([int64]$hwnd) $name")
      }
      'paste' {
        [OpenPoodNative]::CtrlV()
        $out.WriteLine("$id ok")
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
}

let child: ChildProcessWithoutNullStreams | null = null;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let disposed = false;

function failAll(err: Error) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
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
      }
      failAll(err);
    };
    proc.on('error', (err) => onGone(err));
    proc.on('exit', (code) => onGone(new Error(`win host exited (${code ?? 'signal'})`)));
  });

  return readyPromise;
}

async function request(cmd: string): Promise<string> {
  await ensureHost();
  const proc = child;
  if (!proc) throw new Error('win host unavailable');
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`win host timeout on "${cmd}"`));
      // A wedged host is worse than a cold one — drop it, next call respawns.
      if (child === proc) killChild();
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    proc.stdin.write(`${id} ${cmd}\n`, (err) => {
      if (err) {
        pending.delete(id);
        clearTimeout(timer);
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

export async function sendCtrlV(): Promise<void> {
  await request('paste');
}

export function disposeWinHost(): void {
  disposed = true;
  failAll(new Error('win host disposed'));
  killChild();
}
