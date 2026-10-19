import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  text: 'previous', formats: ['text/plain'], sequence: 1, files: false, unsupported: false, hasFormats: true,
  clipboard: {
    availableFormats: vi.fn(), readText: vi.fn(), readHTML: vi.fn(), readRTF: vi.fn(), readImage: vi.fn(),
    writeText: vi.fn(), write: vi.fn(),
  },
  getClipboardState: vi.fn(), sendCtrlV: vi.fn(),
}));
vi.mock('electron', () => ({ clipboard: mocks.clipboard }));
vi.mock('./winHost', () => ({ getClipboardState: mocks.getClipboardState, sendCtrlV: mocks.sendCtrlV }));
vi.mock('../src/lib/runtimeConfig', async (original) => {
  const module = await original<typeof import('../src/lib/runtimeConfig')>();
  return { RUNTIME: { ...module.RUNTIME, clipboardSettleMs: 1, clipboardRestoreMs: 1 } };
});
import { pasteAtCursor } from './pasteText';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.text = 'previous'; mocks.sequence = 1; mocks.files = false; mocks.formats = ['text/plain'];
  mocks.unsupported = false; mocks.hasFormats = true;
  mocks.clipboard.availableFormats.mockImplementation(() => mocks.formats);
  mocks.clipboard.readText.mockImplementation(() => mocks.text);
  mocks.clipboard.readHTML.mockReturnValue('<b>previous</b>');
  mocks.clipboard.readRTF.mockReturnValue('{\\rtf1 previous}');
  mocks.clipboard.readImage.mockReturnValue({ isEmpty: () => false, getSize: () => ({ width: 10, height: 10 }) });
  mocks.clipboard.writeText.mockImplementation((text: string) => { mocks.text = text; ++mocks.sequence; });
  mocks.getClipboardState.mockImplementation(async () => ({ sequence: String(mocks.sequence), hasFiles: mocks.files,
    hasUnsupported: mocks.unsupported, hasFormats: mocks.hasFormats }));
  mocks.sendCtrlV.mockResolvedValue('pasted');
});
afterEach(() => vi.restoreAllMocks());

const target = { hwnd: '123', processName: 'test' };
describe('safe paste delivery', () => {
  it.each([null, { hwnd: '0', processName: '' }])('does not inject keys when the captured target is unknown', async (missing) => {
    expect(await pasteAtCursor('transcript', missing)).toEqual({ pasted: false, reason: 'focus-changed' });
    expect(mocks.sendCtrlV).not.toHaveBeenCalled();
    expect(mocks.text).toBe('transcript');
  });
  it('passes the original HWND and clipboard sequence to the native focus guard', async () => {
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: true });
    expect(mocks.sendCtrlV).toHaveBeenCalledWith('123', '2', undefined);
    expect(mocks.clipboard.write).toHaveBeenCalledWith({ text: 'previous' });
  });
  it('leaves transcript on clipboard when native focus check declines paste', async () => {
    mocks.sendCtrlV.mockResolvedValue('focus-changed');
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'focus-changed' });
    expect(mocks.text).toBe('transcript');
    expect(mocks.clipboard.write).not.toHaveBeenCalled();
  });
  it('restores all supported rich formats together', async () => {
    mocks.formats = ['text/plain', 'text/html', 'text/rtf', 'image/png'];
    await pasteAtCursor('transcript', target);
    expect(mocks.clipboard.write).toHaveBeenCalledWith({ text: 'previous', html: '<b>previous</b>', rtf: '{\\rtf1 previous}', image: expect.any(Object) });
  });
  it.each(['files', 'custom', 'oversized-image'])('preserves %s without overwriting clipboard', async (scenario) => {
    if (scenario === 'files') mocks.files = true;
    if (scenario === 'custom') mocks.formats = ['application/x-custom'];
    if (scenario === 'oversized-image') {
      mocks.formats = ['image/png'];
      mocks.clipboard.readImage.mockReturnValue({ isEmpty: () => false, getSize: () => ({ width: 10000, height: 10000 }) });
    }
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'clipboard-preserved' });
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
    expect(mocks.sendCtrlV).not.toHaveBeenCalled();
  });
  it('does not overwrite a user copy after injection, even with identical text', async () => {
    mocks.sendCtrlV.mockImplementation(async () => { ++mocks.sequence; return 'pasted'; });
    await pasteAtCursor('transcript', target);
    expect(mocks.clipboard.write).not.toHaveBeenCalled();
  });
  it.each([{ formats: [] as string[] }, { formats: ['text/plain'] }])('preserves native custom formats hidden from Electron ($formats)', async ({ formats }) => {
    mocks.formats = formats;
    mocks.unsupported = true;
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'clipboard-preserved' });
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
    expect(mocks.sendCtrlV).not.toHaveBeenCalled();
  });
  it('preserves native data when Electron exposes no restorable format', async () => {
    mocks.formats = [];
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'clipboard-preserved' });
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('allows a genuinely empty clipboard', async () => {
    mocks.formats = []; mocks.hasFormats = false;
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: true });
  });
  it('preserves a clipboard change during snapshot acquisition', async () => {
    mocks.getClipboardState.mockResolvedValueOnce({ sequence: '1', hasFiles: false })
      .mockResolvedValueOnce({ sequence: '2', hasFiles: false });
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'clipboard-preserved' });
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('leaves recoverable text when the host/paste fails', async () => {
    mocks.sendCtrlV.mockRejectedValue(new Error('host down'));
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'paste-failed' });
    expect(mocks.text).toBe('transcript');
  });
  it('preserves clipboard when its native state cannot be read', async () => {
    mocks.getClipboardState.mockRejectedValue(new Error('host down'));
    expect(await pasteAtCursor('transcript', target)).toEqual({ pasted: false, reason: 'clipboard-preserved' });
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('restores clipboard on cancellation before injection', async () => {
    const controller = new AbortController();
    mocks.clipboard.writeText.mockImplementation((text: string) => {
      mocks.text = text; ++mocks.sequence; controller.abort();
    });
    await expect(pasteAtCursor('transcript', target, controller.signal)).rejects.toThrow();
    expect(mocks.sendCtrlV).not.toHaveBeenCalled();
    expect(mocks.clipboard.write).toHaveBeenCalledWith({ text: 'previous' });
  });
});
