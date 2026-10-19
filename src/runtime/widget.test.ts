import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountWidget } from './widget';

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }));
vi.mock('./recorder', () => ({
  isSilentRecording: () => false,
  MicRecorder: class { start = mocks.start; stop = mocks.stop; cancel = mocks.cancel; peakLevel = 0.5; },
}));

let toggle: (mode: 'dictate' | 'translate') => void;
let cancel: () => void;
let unload: () => void;
let pill: { dataset: { state: string } };
let api: {
  getSettings: ReturnType<typeof vi.fn>; setRecordingState: ReturnType<typeof vi.fn>; runTranscription: ReturnType<typeof vi.fn>;
  cancelTranscription: ReturnType<typeof vi.fn>; reportRecordingError: ReturnType<typeof vi.fn>;
};
const settings = { playSound: false, micDeviceId: '', maxDurationSec: 120 };
const analyser = { getByteFrequencyData: (data: Uint8Array) => data.fill(0) };

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  mocks.start.mockResolvedValue({ deviceLabel: 'Test mic', analyser });
  mocks.stop.mockResolvedValue({ buffer: new ArrayBuffer(10), mimeType: 'audio/webm' });
  api = {
    getSettings: vi.fn().mockResolvedValue(settings), setRecordingState: vi.fn(),
    runTranscription: vi.fn().mockResolvedValue({ ok: true }), cancelTranscription: vi.fn().mockResolvedValue(undefined), reportRecordingError: vi.fn(),
  };
  pill = { dataset: { state: 'idle' } };
  const elements: Record<string, unknown> = { 'pill-wrap': pill, 'mic-label': { textContent: '' }, wave: {
    width: 160, height: 28, getContext: () => ({ clearRect: vi.fn(), fillRect: vi.fn() }),
  } };
  vi.stubGlobal('document', { getElementById: (id: string) => elements[id] });
  vi.stubGlobal('window', {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    typeless: {
      ...api,
      onToggleRecording: (callback: typeof toggle) => { toggle = callback; return vi.fn(); },
      onCancelRecording: (callback: typeof cancel) => { cancel = callback; return vi.fn(); },
    },
    addEventListener: (_event: string, callback: typeof unload) => { unload = callback; },
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  mountWidget({ innerHTML: '' } as HTMLElement);
});
afterEach(() => { unload(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('widget asynchronous transitions', () => {
  it('locks the start state before settings/microphone await', async () => {
    let resolve!: (value: typeof settings) => void;
    api.getSettings.mockImplementation(() => new Promise((next) => { resolve = next; }));
    toggle('dictate'); toggle('translate');
    expect(api.getSettings).toHaveBeenCalledOnce();
    expect(pill.dataset.state).toBe('starting');
    resolve(settings);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(pill.dataset.state).toBe('recording');
  });
  it('does not open microphone when Escape cancels pending settings', async () => {
    let resolve!: (value: typeof settings) => void;
    api.getSettings.mockImplementation(() => new Promise((next) => { resolve = next; }));
    toggle('dictate'); cancel(); resolve(settings);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(pill.dataset.state).toBe('idle');
  });
  it('releases recorder after a setup failure', async () => {
    mocks.start.mockRejectedValue(new Error('audio context failed'));
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(pill.dataset.state).toBe('idle');
    expect(api.reportRecordingError).toHaveBeenCalledOnce();
  });
  it('falls back only when the saved device is missing', async () => {
    api.getSettings.mockResolvedValue({ ...settings, micDeviceId: 'missing-device' });
    mocks.start.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.start.mock.calls).toEqual([['missing-device'], []]);
    expect(pill.dataset.state).toBe('recording');
  });
  it('does not retry microphone permission denial', async () => {
    api.getSettings.mockResolvedValue({ ...settings, micDeviceId: 'device' });
    mocks.start.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(pill.dataset.state).toBe('idle');
  });
  it('stops capture without waiting for another settings IPC', async () => {
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    expect(api.getSettings).toHaveBeenCalledOnce();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(api.runTranscription).toHaveBeenCalledOnce();
    expect(pill.dataset.state).toBe('idle');
  });
  it('waits for processing cancellation before allowing a new recording', async () => {
    let finish!: () => void;
    let cancelled!: () => void;
    api.runTranscription.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    api.cancelTranscription.mockImplementation(() => new Promise<void>((resolve) => { cancelled = resolve; }));
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    cancel(); toggle('dictate');
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(pill.dataset.state).toBe('processing');
    finish(); cancelled(); await vi.advanceTimersByTimeAsync(0);
    expect(pill.dataset.state).toBe('idle');
    toggle('dictate'); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
});
