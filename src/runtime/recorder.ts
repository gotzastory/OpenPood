import { RUNTIME } from '../lib/runtimeConfig';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'processing' | 'skipped';

export function isSilentRecording(peakRms: number, durationMs: number): boolean {
  return durationMs < RUNTIME.minRecordingMs || peakRms < RUNTIME.silenceRms;
}

function cancelled(): DOMException {
  return new DOMException('ยกเลิกการอัดเสียงแล้ว', 'AbortError');
}

export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private chunkBytes = 0;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private levelTimer = 0;
  private peakRms = 0;
  private starting = false;
  private generation = 0;
  private cancelStart: (() => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;
  private readonly onFailure: (error: Error) => void;

  constructor(onFailure: (error: Error) => void = () => undefined) {
    this.onFailure = onFailure;
  }

  get peakLevel(): number { return this.peakRms; }

  async start(deviceId?: string): Promise<{ deviceLabel: string; analyser: AnalyserNode }> {
    if (this.starting || this.mediaRecorder) throw new Error('กำลังอัดเสียงอยู่');
    this.starting = true;
    const generation = ++this.generation;
    try {
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        let settled = false;
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };
        const timer = window.setTimeout(() => fail(new Error('เปิดไมโครโฟนหมดเวลา')), RUNTIME.micStartTimeoutMs);
        this.cancelStart = () => fail(cancelled());
        // Permission requests cannot be aborted. Stop any stream granted late.
        void navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        }).then((nextStream) => {
          if (settled || generation !== this.generation) {
            nextStream.getTracks().forEach((track) => track.stop());
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(nextStream);
        }, fail);
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        throw cancelled();
      }
      this.stream = stream;
      this.cancelStart = null;
      this.chunks = [];
      this.chunkBytes = 0;
      this.peakRms = 0;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      this.mediaRecorder = recorder;
      recorder.ondataavailable = (event) => {
        if (generation !== this.generation || !event.data.size) return;
        this.chunkBytes += event.data.size;
        if (this.chunkBytes > RUNTIME.maxAudioBytes) {
          this.fail(new Error('ไฟล์เสียงใหญ่เกินขีดจำกัด กรุณาอัดสั้นลง'));
          return;
        }
        this.chunks.push(event.data);
      };
      recorder.onerror = () => this.fail(new Error('อัดเสียงไม่สำเร็จ กรุณาตรวจสอบไมโครโฟน'));
      recorder.onstop = () => this.fail(new Error('ไมโครโฟนหยุดทำงาน กรุณาลองใหม่'));
      stream.getTracks().forEach((track) => {
        track.onended = () => this.fail(new Error('ไมโครโฟนถูกตัดการเชื่อมต่อ กรุณาลองใหม่'));
      });
      const audioCtx = new AudioContext();
      this.audioCtx = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      await audioCtx.resume();
      if (generation !== this.generation) throw cancelled();
      recorder.start(RUNTIME.recorderChunkMs);
      const samples = new Uint8Array(analyser.fftSize);
      this.levelTimer = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        this.peakRms = Math.max(this.peakRms, Math.sqrt(sum / samples.length));
      }, RUNTIME.levelSampleMs);
      return { deviceLabel: stream.getAudioTracks()[0]?.label || 'Microphone', analyser };
    } catch (error) {
      if (generation === this.generation) this.cancel();
      throw error;
    } finally {
      if (generation === this.generation) {
        this.starting = false;
        this.cancelStart = null;
      }
    }
  }

  private fail(error: Error): void {
    this.cancel();
    this.onFailure(error);
  }

  private teardown(): void {
    clearInterval(this.levelTimer);
    this.levelTimer = 0;
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    this.stream = null;
    if (this.audioCtx) void this.audioCtx.close().catch(() => undefined);
    this.audioCtx = null;
  }

  stop(): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state !== 'recording' || this.rejectStop) {
      return Promise.reject(new Error('ยังไม่ได้เริ่มอัดเสียง'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.rejectStop = null;
        this.cancel();
        reject(error);
      };
      const timer = window.setTimeout(() => fail(new Error('หยุดอัดเสียงหมดเวลา')), RUNTIME.recorderStopTimeoutMs);
      this.rejectStop = fail;
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        // Release microphone before conversion; keep cancellation available until resolved.
        this.teardown();
        void blob.arrayBuffer().then((buffer) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.rejectStop = null;
          this.mediaRecorder = null;
          this.chunks = [];
          resolve({ buffer, mimeType: recorder.mimeType });
        }, () => fail(new Error('อ่านไฟล์เสียงไม่สำเร็จ กรุณาลองใหม่')));
      };
      try { recorder.stop(); }
      catch { fail(new Error('หยุดอัดเสียงไม่สำเร็จ')); }
    });
  }

  cancel(): void {
    ++this.generation;
    this.starting = false;
    this.cancelStart?.();
    this.cancelStart = null;
    const rejectStop = this.rejectStop;
    this.rejectStop = null;
    rejectStop?.(cancelled());
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    if (recorder) {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* Already stopped by the device. */ }
      }
    }
    this.chunks = [];
    this.chunkBytes = 0;
    this.teardown();
  }
}
