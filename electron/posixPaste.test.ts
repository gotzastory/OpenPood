import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  text: 'previous',
  formats: ['text/plain'] as string[],
  clipboard: {
    availableFormats: vi.fn(),
    readText: vi.fn(),
    readHTML: vi.fn(),
    readRTF: vi.fn(),
    readImage: vi.fn(),
    writeText: vi.fn(),
    write: vi.fn(),
  },
}));

vi.mock('electron', () => ({ clipboard: mocks.clipboard }));
vi.mock('../src/lib/runtimeConfig', async (original) => {
  const module = await original<typeof import('../src/lib/runtimeConfig')>();
  return { RUNTIME: { ...module.RUNTIME, clipboardSettleMs: 1, clipboardRestoreMs: 1 } };
});

import { injectPasteKeystroke, pastePosix } from './posixPaste';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.text = 'previous';
  mocks.formats = ['text/plain'];
  mocks.clipboard.availableFormats.mockImplementation(() => mocks.formats);
  mocks.clipboard.readText.mockImplementation(() => mocks.text);
  mocks.clipboard.readHTML.mockReturnValue('');
  mocks.clipboard.readRTF.mockReturnValue('');
  mocks.clipboard.readImage.mockReturnValue({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) });
  mocks.clipboard.writeText.mockImplementation((text: string) => { mocks.text = text; });
});
afterEach(() => vi.restoreAllMocks());

describe('posix paste fallback', () => {
  it('notifies via injection-unavailable and keeps text on clipboard when Wayland tools are missing', async () => {
    const inject = vi.fn(async () => 'injection-unavailable' as const);
    const result = await pastePosix('transcript', undefined, inject);
    expect(result).toEqual({ pasted: false, reason: 'injection-unavailable' });
    expect(mocks.clipboard.writeText).toHaveBeenCalledWith('transcript');
    expect(mocks.text).toBe('transcript');
    expect(mocks.clipboard.write).not.toHaveBeenCalled();
    expect(inject).toHaveBeenCalledOnce();
  });

  it('leaves recoverable text when keystroke injection throws', async () => {
    const inject = vi.fn(async () => { throw new Error('xdotool missing'); });
    expect(await pastePosix('transcript', undefined, inject)).toEqual({ pasted: false, reason: 'paste-failed' });
    expect(mocks.text).toBe('transcript');
    expect(mocks.clipboard.write).not.toHaveBeenCalled();
  });

  it('uses osascript Cmd+V on macOS', async () => {
    const runCommand = vi.fn(async () => undefined);
    await expect(injectPasteKeystroke({
      platform: 'darwin',
      runCommand,
      hasCommand: async () => false,
    })).resolves.toBe('pasted');
    expect(runCommand).toHaveBeenCalledWith(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      undefined,
    );
  });

  it('prefers wtype then ydotool on Wayland', async () => {
    const runCommand = vi.fn(async () => undefined);
    const hasCommand = vi.fn(async (command: string) => command === 'wtype');
    await expect(injectPasteKeystroke({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'wayland' },
      runCommand,
      hasCommand,
    })).resolves.toBe('pasted');
    expect(runCommand).toHaveBeenCalledWith('wtype', ['-M', 'ctrl', '-k', 'v', '-m', 'ctrl'], undefined);

    runCommand.mockClear();
    const hasYdo = vi.fn(async (command: string) => command === 'ydotool');
    await expect(injectPasteKeystroke({
      platform: 'linux',
      env: { WAYLAND_DISPLAY: 'wayland-1' },
      runCommand,
      hasCommand: hasYdo,
    })).resolves.toBe('pasted');
    expect(runCommand).toHaveBeenCalledWith('ydotool', ['key', '29:1', '47:1', '47:0', '29:0'], undefined);
  });

  it('returns injection-unavailable on Wayland when neither wtype nor ydotool exists', async () => {
    await expect(injectPasteKeystroke({
      platform: 'linux',
      env: { WAYLAND_DISPLAY: 'wayland-0' },
      runCommand: vi.fn(async () => undefined),
      hasCommand: async () => false,
    })).resolves.toBe('injection-unavailable');
  });

  it('uses xdotool on X11 when available', async () => {
    const runCommand = vi.fn(async () => undefined);
    const hasCommand = vi.fn(async (command: string) => command === 'xdotool');
    await expect(injectPasteKeystroke({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'x11' },
      runCommand,
      hasCommand,
    })).resolves.toBe('pasted');
    expect(runCommand).toHaveBeenCalledWith('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], undefined);
  });
});
