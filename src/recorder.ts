export type RecorderState = "idle" | "recording" | "processing";

export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;

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

    const track = this.stream.getAudioTracks()[0];
    const deviceLabel = track?.label || "Microphone";
    return { deviceLabel, analyser: this.analyser };
  }

  private teardown() {
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
    this.teardown();
  }
}
