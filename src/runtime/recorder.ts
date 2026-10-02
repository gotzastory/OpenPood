export type RecorderState = "idle" | "recording" | "processing" | "skipped";

// Recordings shorter than this are almost always an accidental double-tap.
const MIN_DURATION_MS = 400;
// Peak RMS (0..1 full scale) below which nothing was said. A quiet room over
// a typical mic sits around 0.002-0.01; speech peaks well above 0.05.
const SILENCE_RMS_THRESHOLD = 0.015;
const LEVEL_SAMPLE_MS = 100;

// Whisper hallucinates on near-silent audio ("ขอบคุณครับ", "Thanks for
// watching") — skip the API entirely when the clip has no speech in it.
export function isSilentRecording(peakRms: number, durationMs: number): boolean {
  return durationMs < MIN_DURATION_MS || peakRms < SILENCE_RMS_THRESHOLD;
}

export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer = 0;
  private peakRms = 0;

  /** Highest RMS level observed since `start()`; reset on each start. */
  get peakLevel(): number {
    return this.peakRms;
  }

  async start(
    deviceId?: string,
  ): Promise<{ deviceLabel: string; analyser: AnalyserNode }> {
    const audioConstraint: boolean | MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId } }
      : true;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraint,
    });
    this.chunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();

    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 64;
    source.connect(this.analyser);

    this.peakRms = 0;
    const samples = new Uint8Array(this.analyser.fftSize);
    const analyser = this.analyser;
    // setInterval rather than rAF: timers keep ticking (throttled) even if the
    // widget window is occluded, and peak tracking only needs coarse samples.
    this.levelTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / samples.length);
      if (rms > this.peakRms) this.peakRms = rms;
    }, LEVEL_SAMPLE_MS);

    const track = this.stream.getAudioTracks()[0];
    const deviceLabel = track?.label || "Microphone";
    return { deviceLabel, analyser: this.analyser };
  }

  private teardown() {
    clearInterval(this.levelTimer);
    this.levelTimer = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
  }

  stop(): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("ยังไม่ได้เริ่มอัดเสียง"));
        return;
      }
      const mimeType = this.mediaRecorder.mimeType;
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        const buffer = await blob.arrayBuffer();
        this.teardown();
        resolve({ buffer, mimeType });
      };
      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.teardown();
  }
}
