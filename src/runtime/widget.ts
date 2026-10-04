import { isSilentRecording, MicRecorder, type RecorderState } from "./recorder";
import type { RecordingMode } from "../types";

const BAR_COUNT = 24;
// How long the "ไม่ได้ยินเสียง" hint stays up before the pill hides again.
const SKIPPED_HINT_MS = 900;

const MODE_LABEL: Record<RecordingMode, string> = {
  dictate: "Dictate",
  translate: "Translate",
};

function beep(freq: number) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
  osc.onended = () => ctx.close();
}

export function mountWidget(root: HTMLElement) {
  root.innerHTML = `
    <div
      id="pill-wrap"
      data-state="idle"
      class="group flex h-full flex-col items-center justify-end gap-2 pb-3.5 opacity-0 translate-y-1.5 pointer-events-none transition-[opacity,transform] duration-150 ease-out data-[state=recording]:opacity-100 data-[state=recording]:translate-y-0 data-[state=processing]:opacity-100 data-[state=processing]:translate-y-0 data-[state=skipped]:opacity-100 data-[state=skipped]:translate-y-0"
    >
      <div id="mic-label" class="max-w-[300px] truncate whitespace-nowrap rounded-full border border-white/10 bg-brand-ink/90 px-2.5 py-1 text-[11px] text-brand-paper empty:hidden group-data-[state=skipped]:hidden"></div>
      <div id="pill" class="flex h-11 items-center justify-center rounded-full border border-white/10 bg-brand-ink/95 px-[18px] text-brand-paper shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
        <img src="./brand/openpood-symbol.png" alt="" width="20" height="20" class="mr-3 h-5 w-5 shrink-0" /><canvas id="wave" width="160" height="28" class="hidden group-data-[state=recording]:block"></canvas>
        <div role="status" id="processing-content" class="hidden items-center gap-2 whitespace-nowrap text-xs group-data-[state=processing]:flex">
          <span class="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white"></span>
          <span>กำลังถอดข้อความ...</span>
        </div>
        <div id="skipped-content" class="hidden items-center whitespace-nowrap text-xs text-brand-paper/75 group-data-[state=skipped]:flex">
          <span>ไม่ได้ยินเสียง</span>
        </div>
      </div>
    </div>
  `;

  const pillWrap = document.getElementById("pill-wrap")!;
  const micLabel = document.getElementById("mic-label")!;
  const canvas = document.getElementById("wave") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const recorder = new MicRecorder();
  let state: RecorderState = "idle";
  let rafId = 0;
  let analyser: AnalyserNode | null = null;
  let recordStartedAt = 0;
  let maxDurationTimer = 0;
  let skippedTimer = 0;
  let pendingMode: RecordingMode = "dictate";

  function setState(next: RecorderState) {
    state = next;
    pillWrap.dataset.state = next;
    // Main uses this to grab Escape as a cancel key only while recording.
    window.typeless.setRecordingState(next);
  }

  function drawLiveBars() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barWidth = 3;
    const gap = 3.5;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    for (let i = 0; i < BAR_COUNT; i++) {
      const v = data[Math.floor((i / BAR_COUNT) * data.length)] / 255;
      const barH = Math.max(3, v * h);
      const x = i * (barWidth + gap);
      ctx.fillRect(x, h / 2 - barH / 2, barWidth, barH);
    }
    rafId = requestAnimationFrame(drawLiveBars);
  }

  async function beginRecording() {
    clearTimeout(skippedTimer);
    try {
      // Inside the try: if this IPC call rejects, we still reach the catch's
      // setState("idle") instead of wedging the pill.
      const settings = await window.typeless.getSettings();
      let started;
      try {
        started = await recorder.start(settings.micDeviceId || undefined);
      } catch (err) {
        // Selected device may no longer exist (unplugged/changed) — fall back to the OS default mic.
        if (settings.micDeviceId) {
          started = await recorder.start();
        } else {
          throw err;
        }
      }
      analyser = started.analyser;
      recordStartedAt = Date.now();
      micLabel.textContent =
        pendingMode === "dictate"
          ? `Dictate · ${started.deviceLabel}`
          : `${MODE_LABEL[pendingMode]} · ${started.deviceLabel}`;
      setState("recording");
      drawLiveBars();
      if (settings.playSound) beep(880);
      if (settings.maxDurationSec > 0) {
        maxDurationTimer = window.setTimeout(
          finishRecording,
          settings.maxDurationSec * 1000,
        );
      }
    } catch (err) {
      setState("idle");
      console.error(err);
    }
  }

  function stopWave() {
    cancelAnimationFrame(rafId);
    analyser = null;
    clearTimeout(maxDurationTimer);
  }

  function showSkippedHint() {
    setState("skipped");
    skippedTimer = window.setTimeout(() => {
      if (state === "skipped") setState("idle");
    }, SKIPPED_HINT_MS);
  }

  async function finishRecording() {
    if (state !== "recording") return;
    stopWave();
    setState("processing");
    try {
      const settings = await window.typeless.getSettings();
      const { buffer, mimeType } = await recorder.stop();
      const durationMs = Date.now() - recordStartedAt;
      // Nothing said (or an accidental double-tap): skip the API entirely so
      // Whisper can't hallucinate text out of silence.
      if (isSilentRecording(recorder.peakLevel, durationMs)) {
        if (settings.playSound) beep(220);
        showSkippedHint();
        return;
      }
      if (settings.playSound) beep(440);
      await window.typeless.runTranscription(buffer, mimeType, durationMs, pendingMode);
    } catch (err) {
      console.error(err);
    } finally {
      // Cast: TS narrowed `state` to "recording" at the top of the function
      // and can't see that setState() reassigns it. "skipped" must survive so
      // its hint timer, not this block, hides the pill.
      if ((state as RecorderState) === "processing") setState("idle");
    }
  }

  function cancelRecording() {
    if (state !== "recording") return;
    stopWave();
    recorder.cancel();
    setState("idle");
  }

  function toggleFromHotkey(mode: RecordingMode) {
    if (state === "idle" || state === "skipped") {
      pendingMode = mode;
      beginRecording();
    } else if (state === "recording") {
      finishRecording();
    }
  }

  window.typeless.onToggleRecording(toggleFromHotkey);
  window.typeless.onCancelRecording(cancelRecording);
}
