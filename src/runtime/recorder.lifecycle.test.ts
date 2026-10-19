import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicRecorder } from './recorder';
import { RUNTIME } from '../lib/runtimeConfig';

let failConstruction = false;
let neverStops = false;
let currentRecorder: FakeMediaRecorder;
let currentTrack: { label: string; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
let closeAudio: ReturnType<typeof vi.fn>;
const recorders: MicRecorder[] = [];

class FakeMediaRecorder {
  static isTypeSupported() { return true; }
  state = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    if (failConstruction) throw new Error('constructor failed');
    currentRecorder = this;
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    if (!neverStops) queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['audio']) });
      this.onstop?.();
    });
  }
}

function makeStream() {
  const track = { label: 'Test mic', stop: vi.fn(), onended: null as (() => void) | null };
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
}
function recorder(onFailure?: (error: Error) => void) {
  const next = new MicRecorder(onFailure);
  recorders.push(next);
  return next;
}

beforeEach(() => {
  failConstruction = false;
  neverStops = false;
  const { stream, track } = makeStream();
  currentTrack = track;
  closeAudio = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('window', { setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args), setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args) });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('AudioContext', class {
    resume = vi.fn().mockResolvedValue(undefined);
    close = closeAudio;
    createMediaStreamSource() { return { connect: vi.fn() }; }
    createAnalyser() { return { fftSize: 64, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) }; }
  });
});
afterEach(() => {
  for (const next of recorders.splice(0)) next.cancel();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('microphone lifecycle', () => {
  it('releases acquired tracks if recorder construction fails and permits retry', async () => {
    const next = recorder();
    failConstruction = true;
    await expect(next.start()).rejects.toThrow('constructor failed');
    expect(currentTrack.stop).toHaveBeenCalledOnce();
    failConstruction = false;
    await expect(next.start()).resolves.toMatchObject({ deviceLabel: 'Test mic' });
  });
  it('allows only one pending microphone acquisition', async () => {
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn().mockImplementation(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const next = recorder();
    const pending = next.start();
    await expect(next.start()).rejects.toThrow('กำลังอัด');
    grant(makeStream().stream);
    await pending;
    expect(getUserMedia).toHaveBeenCalledOnce();
  });
  it('stops a late permission grant after Escape/cancel', async () => {
    let grant!: (stream: MediaStream) => void;
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockImplementation(() => new Promise<MediaStream>((resolve) => { grant = resolve; })) } });
    const next = recorder();
    const pending = next.start();
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    next.cancel();
    await rejection;
    const late = makeStream();
    grant(late.stream);
    await Promise.resolve();
    expect(late.track.stop).toHaveBeenCalledOnce();
  });
  it('times out microphone permission and releases a later grant', async () => {
    vi.useFakeTimers();
    let grant!: (stream: MediaStream) => void;
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockImplementation(() => new Promise<MediaStream>((resolve) => { grant = resolve; })) } });
    const pending = recorder().start();
    const rejection = expect(pending).rejects.toThrow('หมดเวลา');
    await vi.advanceTimersByTimeAsync(RUNTIME.micStartTimeoutMs);
    await rejection;
    const late = makeStream();
    grant(late.stream);
    await Promise.resolve();
    expect(late.track.stop).toHaveBeenCalledOnce();
  });
  it('releases microphone/context on normal stop', async () => {
    const next = recorder();
    await next.start();
    expect((await next.stop()).buffer.byteLength).toBeGreaterThan(0);
    expect(currentTrack.stop).toHaveBeenCalledOnce();
    expect(closeAudio).toHaveBeenCalledOnce();
  });
  it('rejects conversion failures instead of leaving stop pending', async () => {
    const next = recorder();
    await next.start();
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockRejectedValue(new Error('conversion failed'));
    await expect(next.stop()).rejects.toThrow('อ่านไฟล์เสียง');
    expect(currentTrack.stop).toHaveBeenCalledOnce();
    await expect(next.start()).resolves.toBeDefined();
  });
  it('rejects a stop event that never arrives and frees resources', async () => {
    vi.useFakeTimers();
    neverStops = true;
    const next = recorder();
    await next.start();
    const rejection = expect(next.stop()).rejects.toThrow('หมดเวลา');
    await vi.advanceTimersByTimeAsync(RUNTIME.recorderStopTimeoutMs);
    await rejection;
    expect(currentTrack.stop).toHaveBeenCalledOnce();
  });
  it('cancels an in-progress stop without a hanging promise', async () => {
    neverStops = true;
    const next = recorder();
    await next.start();
    const rejection = expect(next.stop()).rejects.toMatchObject({ name: 'AbortError' });
    next.cancel();
    await rejection;
  });
  it.each(['unplug', 'recorder-error'])('cleans up and reports %s', async (scenario) => {
    const failure = vi.fn();
    const next = recorder(failure);
    await next.start();
    if (scenario === 'unplug') currentTrack.onended?.();
    else currentRecorder.onerror?.();
    expect(failure).toHaveBeenCalledOnce();
    expect(currentTrack.stop).toHaveBeenCalledOnce();
    await expect(next.start()).resolves.toBeDefined();
  });
});
