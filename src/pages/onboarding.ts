interface ProviderPreset {
  key: "openai" | "openrouter" | "gemini";
  name: string;
  sub: string;
  baseUrl: string;
  model: string;
}

const PROVIDERS: ProviderPreset[] = [
  {
    key: "openrouter",
    name: "OpenRouter (แนะนำ)",
    sub: "whisper-large-v3-turbo · gemini-3.5-flash-lite",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/whisper-large-v3-turbo",
  },
  {
    key: "gemini",
    name: "Gemini (Google AI Studio)",
    sub: "aistudio.google.com · gemini-3.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.5-flash",
  },
  {
    key: "openai",
    name: "OpenAI",
    sub: "api.openai.com · whisper-1",
    baseUrl: "https://api.openai.com/v1",
    model: "whisper-1",
  },
];

const CHAT_MODEL_BY_PROVIDER: Record<ProviderPreset["key"], string> = {
  openrouter: "google/gemini-3.5-flash-lite",
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-4o-mini",
};

import { escapeHtml } from "../lib/escape";

const TOTAL_STEPS = 4;

const FIELD_LABEL =
  "block font-display text-[11px] tracking-normal text-paper/55 mb-2";
const FIELD_INPUT =
  "w-full rounded-lg border border-paper/10 bg-ink-raised px-3.5 py-3 font-display text-sm text-paper outline-none transition focus:border-blue focus:shadow-[0_0_0_3px_rgba(0,85,255,0.16)] placeholder:text-paper/55";
const BTN_PRIMARY =
  "rounded-lg bg-blue px-7 py-3.5 font-display text-[13px] font-bold tracking-normal text-paper transition hover:shadow-[0_6px_20px_rgba(0,85,255,0.35)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";
const BTN_GHOST =
  "px-1 py-3.5 font-display text-[13px] tracking-normal text-paper/55 hover:text-paper";

interface WizardState {
  step: number;
  provider: ProviderPreset["key"];
  apiKey: string;
  micDeviceId: string;
  hotkey: string;
}

async function finishOnboarding() {
  location.hash = "/";
  location.reload();
}

export async function mountOnboarding(root: HTMLElement) {
  const existing = await window.typeless.getSettings();
  const state: WizardState = {
    step: 0,
    provider: existing.apiBaseUrl.includes("openai.com")
      ? "openai"
      : existing.apiBaseUrl.includes("generativelanguage.googleapis.com")
        ? "gemini"
        : "openrouter",
    // settings:get redacts the key — track only whether one is already saved.
    apiKey: "",
    micDeviceId: existing.micDeviceId,
    hotkey: existing.hotkey || "Control+Space",
  };
  const hasSavedApiKey = existing.hasApiKey;

  let micStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let rafId = 0;

  function teardownMic() {
    cancelAnimationFrame(rafId);
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  }

  function heroWaveHtml() {
    const bars = Array.from({ length: 22 }, (_, i) => {
      const h = 14 + Math.round(Math.sin(i * 0.7) * 10 + 24);
      return `<span class="w-1 rounded-full bg-blue" style="height:${h}px"></span>`;
    }).join("");
    return `<div class="mb-10 mt-2 flex h-16 items-end gap-1">${bars}</div>`;
  }

  function render() {
    root.innerHTML = `
      <div class="ob-root relative flex h-full w-full flex-col overflow-y-auto bg-ink font-display text-paper">
        <div class="relative z-10 flex items-center justify-between px-8 py-5 font-display text-[11px] tracking-normal text-paper/55">
          <span class="brand-logo brand-logo-light" role="img" aria-label="OpenPood"></span>
          <div class="flex gap-1.5" role="img" aria-label="ขั้นตอนที่ ${state.step + 1} จาก ${TOTAL_STEPS}">
            ${Array.from({ length: TOTAL_STEPS })
              .map(
                (_, i) =>
                  `<div class="h-[3px] w-[22px] rounded-sm transition-colors duration-300 ${i < state.step ? "bg-blue" : i === state.step ? "bg-paper" : "bg-paper/10"}"></div>`,
              )
              .join("")}
          </div>
          <button class="cursor-pointer border-none bg-none font-display text-[11px] tracking-normal text-paper/55 hover:text-paper" id="ob-skip">ข้ามไปก่อน</button>
        </div>
        <div class="relative z-10 flex flex-1 items-center justify-center px-8 py-6 lg:px-12 lg:pb-12">
          <div class="ob-panel w-full max-w-[620px]" id="ob-panel" tabindex="-1">${renderStep()}<p id="ob-save-error" role="alert" class="mt-4 text-sm text-paper"></p></div>
        </div>
      </div>
    `;

    document.getElementById("ob-panel")?.focus({ preventScroll: true });
    document.getElementById("ob-skip")?.addEventListener("click", () => {
      void saveOnboarding({ onboardingCompleted: true }, "ob-skip");
    });

    wireStep();
  }

  function renderStep(): string {
    if (state.step === 0) {
      return `
        ${heroWaveHtml()}
        <h1 class="mb-4.5 text-[36px] lg:text-[44px] font-semibold leading-[1.08] tracking-tight">พูด แล้วให้ตัวอักษร<br /><em class="not-italic font-semibold text-paper">ตามทัน</em></h1>
        <p class="mb-6 max-w-[540px] font-display text-[13.5px] leading-[1.7] text-paper/55">กด hotkey ครั้งเดียว พูดสิ่งที่คิด แล้วมันจะถูกพิมพ์ให้ที่ตำแหน่ง cursor ทันที — ไม่ต้องพิมพ์เองอีกต่อไป ตั้งค่า 3 ขั้นตอนสั้นๆ ก่อนเริ่มใช้งานจริง</p>
        <div class="mt-2 flex items-center gap-4">
          <button class="${BTN_PRIMARY}" id="ob-next">เริ่มตั้งค่า</button>
        </div>
      `;
    }

    if (state.step === 1) {
      return `
        <div class="mb-4 font-display text-[11px] tracking-[0.14em] text-blue">ขั้นตอนที่ 2 จาก ${TOTAL_STEPS}</div>
        <h1 class="mb-4.5 text-[36px] lg:text-[44px] font-semibold leading-[1.08] tracking-tight">เสียงของคุณจะถูกส่งไป<br /><em class="not-italic font-semibold text-paper">ที่ไหน</em></h1>
        <p class="mb-6 max-w-[540px] font-display text-[13.5px] leading-[1.7] text-paper/55">เลือก API ที่จะรับเสียงเพื่อถอดข้อความ ใช้ API Key ของคุณเอง โดย key ถูกเก็บในเครื่องและไม่แสดงกลับในฟอร์ม</p>
        <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          ${PROVIDERS.map(
            (p) => `
            <button type="button" aria-pressed="${state.provider === p.key}" class="ob-provider-card text-left cursor-pointer rounded-[10px] border bg-ink-raised p-4.5 transition hover:border-paper/50 ${state.provider === p.key ? "border-blue shadow-[0_0_0_1px_var(--color-blue)]" : "border-paper/10"}" data-provider="${p.key}">
              <span class="mb-1 block text-sm font-semibold">${p.name}</span>
              <span class="block break-words text-xs leading-relaxed text-paper/55">${p.sub}</span>
              ${state.provider === p.key ? '<span class="mt-2 block text-xs text-paper">เลือกแล้ว</span>' : ''}
            </button>
          `,
          ).join("")}
        </div>
        <div class="mb-4.5">
          <label for="ob-apikey" class="${FIELD_LABEL}">API Key</label>
          <input id="ob-apikey" type="password" placeholder="${hasSavedApiKey ? "•••• บันทึกไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน" : state.provider === "gemini" ? "AIza..." : "sk-..."}" value="${escapeHtml(state.apiKey)}" class="${FIELD_INPUT}" />
        </div>
        <div id="ob-error" role="alert"></div>
        <div class="mt-2 flex items-center gap-4">
          <button class="${BTN_GHOST}" id="ob-back">ย้อนกลับ</button>
          <button class="${BTN_PRIMARY}" id="ob-next">ถัดไป</button>
        </div>
      `;
    }

    if (state.step === 2) {
      return `
        <div class="mb-4 font-display text-[11px] tracking-[0.14em] text-blue">ขั้นตอนที่ 3 จาก ${TOTAL_STEPS}</div>
        <h1 class="mb-4.5 text-[36px] lg:text-[44px] font-semibold leading-[1.08] tracking-tight">ให้เรา<br /><em class="not-italic font-semibold text-paper">ฟังเสียง</em>คุณหน่อย</h1>
        <p class="mb-6 max-w-[540px] font-display text-[13.5px] leading-[1.7] text-paper/55">เลือกไมโครโฟน แล้วลองพูดดู — แถบคลื่นเสียงด้านล่างจะขยับตามเสียงจริงของคุณ</p>
        <div class="mb-4.5">
          <label for="ob-mic" class="${FIELD_LABEL}">ไมโครโฟน</label>
          <select id="ob-mic" class="${FIELD_INPUT}"><option value="">กำลังโหลด...</option></select>
        </div>
        <div id="ob-mic-status" class="mb-5.5 flex items-center gap-2 font-display text-xs text-paper/55">
          <span class="dot h-2 w-2 rounded-full bg-paper/35 transition-colors"></span>
          <span id="ob-mic-status-text">ยังไม่ได้เชื่อมต่อ</span>
        </div>
        <div class="mb-5.5 flex h-[90px] items-center justify-center gap-1.5 rounded-xl border border-paper/10 bg-ink-raised">
          <canvas id="ob-wave" width="500" height="72" class="block"></canvas>
        </div>
        <div class="mt-2 flex items-center gap-4">
          <button class="${BTN_GHOST}" id="ob-back">ย้อนกลับ</button>
          <button class="${BTN_PRIMARY}" id="ob-next">ถัดไป</button>
        </div>
      `;
    }

    const keys = state.hotkey.split("+").map((k) => k.trim());
    return `
      <div class="mb-4 font-display text-[11px] tracking-[0.14em] text-blue">ขั้นตอนที่ 4 จาก ${TOTAL_STEPS}</div>
      <h1 class="mb-4.5 text-[36px] lg:text-[44px] font-semibold leading-[1.08] tracking-tight">จำ shortcut<br />นี้ไว้<em class="not-italic font-semibold text-paper">.</em></h1>
      <p class="mb-6 max-w-[540px] font-display text-[13.5px] leading-[1.7] text-paper/55">กดปุ่มนี้ที่ไหนก็ได้ในระบบเพื่อเริ่มพูด กดอีกครั้งเพื่อหยุดและส่งข้อความ — เปลี่ยนได้ทีหลังในหน้า Settings</p>
      <div class="mb-6.5 flex gap-2.5">${keys
        .map(
          (k) =>
            `<span class="rounded-lg border-[1.5px] border-paper/10 bg-ink-raised px-4.5 py-3 font-display text-[15px] font-bold shadow-[0_3px_0_rgba(245,239,230,0.1)]">${escapeHtml(k)}</span>`,
        )
        .join('<span class="self-center text-paper/55">+</span>')}</div>
      <div class="mb-4.5">
        <label for="ob-hotkey" class="${FIELD_LABEL}">ปรับ Hotkey (ไม่บังคับ)</label>
        <input id="ob-hotkey" type="text" value="${escapeHtml(state.hotkey)}" placeholder="Control+Space" class="${FIELD_INPUT}" />
      </div>
      <div class="mt-2 flex items-center gap-4">
        <button class="${BTN_GHOST}" id="ob-back">ย้อนกลับ</button>
        <button class="${BTN_PRIMARY}" id="ob-finish">เริ่มใช้งาน</button>
      </div>
    `;
  }

  async function populateMicSelect() {
    const select = document.getElementById(
      "ob-mic",
    ) as HTMLSelectElement | null;
    if (!select) return;
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      // permission denied — device list will just lack labels
    }
    const devices = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(
      (d) => d.kind === "audioinput",
    );
    select.innerHTML =
      `<option value="">ค่าเริ่มต้นของระบบ</option>` +
      devices
        .map(
          (d, i) =>
            `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === state.micDeviceId ? "selected" : ""}>${escapeHtml(d.label || `Microphone ${i + 1}`)}</option>`,
        )
        .join("");
    startMicPreview(select.value || undefined);
    select.addEventListener("change", () => {
      state.micDeviceId = select.value;
      startMicPreview(select.value || undefined);
    });
  }

  function startMicPreview(deviceId?: string) {
    teardownMic();
    const statusEl = document.getElementById("ob-mic-status");
    const statusDot = statusEl?.querySelector(".dot");
    const statusText = document.getElementById("ob-mic-status-text");
    const canvas = document.getElementById(
      "ob-wave",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    navigator.mediaDevices
      .getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      .then((stream) => {
        micStream = stream;
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        statusDot?.classList.add(
          "bg-blue",
          "shadow-[0_0_0_4px_rgba(0,85,255,0.16)]",
        );
        statusDot?.classList.remove("bg-paper/35");
        if (statusText) statusText.textContent = "กำลังฟัง — ลองพูดดู";

        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteFrequencyData(data);
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const barCount = 40;
          const barWidth = 4;
          const gap = (w - barCount * barWidth) / (barCount - 1);
          ctx.fillStyle = getComputedStyle(root.firstElementChild!).getPropertyValue("--color-blue").trim();
          for (let i = 0; i < barCount; i++) {
            const v = data[Math.floor((i / barCount) * data.length)] / 255;
            const barH = Math.max(3, v * h);
            const x = i * (barWidth + gap);
            ctx.fillRect(x, h / 2 - barH / 2, barWidth, barH);
          }
          rafId = requestAnimationFrame(draw);
        };
        draw();
      })
      .catch(() => {
        if (statusText)
          statusText.textContent =
            "เข้าถึงไมโครโฟนไม่ได้ — ตรวจสอบสิทธิ์การใช้งาน";
      });
  }

  function wireStep() {
    document.getElementById("ob-back")?.addEventListener("click", () => {
      teardownMic();
      state.step = Math.max(0, state.step - 1);
      render();
    });

    document.getElementById("ob-next")?.addEventListener("click", async () => {
      if (state.step === 1) {
        const apiKey = (
          document.getElementById("ob-apikey") as HTMLInputElement
        ).value.trim();
        if (!apiKey && !hasSavedApiKey) {
          document.getElementById("ob-error")!.innerHTML =
            `<p class="-mt-2 mb-4 font-display text-xs text-blue">ใส่ API Key ก่อนเพื่อไปต่อ</p>`;
          return;
        }
        state.apiKey = apiKey;
      }
      teardownMic();
      state.step = Math.min(TOTAL_STEPS - 1, state.step + 1);
      render();
    });

    document
      .getElementById("ob-finish")
      ?.addEventListener("click", async () => {
        const hotkeyInput = document.getElementById(
          "ob-hotkey",
        ) as HTMLInputElement;
        state.hotkey = hotkeyInput.value.trim() || "Control+Space";
        const preset = PROVIDERS.find((p) => p.key === state.provider)!;
        teardownMic();
        await saveOnboarding({
          // Blank means "keep the already-saved key" (the form never pre-fills it).
          ...(state.apiKey ? { apiKey: state.apiKey } : {}),
          apiBaseUrl: preset.baseUrl,
          model: preset.model,
          chatModel: CHAT_MODEL_BY_PROVIDER[state.provider],
          micDeviceId: state.micDeviceId,
          hotkey: state.hotkey,
          onboardingCompleted: true,
        }, "ob-finish");
      });

    root.querySelectorAll<HTMLElement>(".ob-provider-card").forEach((card) => {
      card.addEventListener("click", () => {
        const apiKeyInput = document.getElementById(
          "ob-apikey",
        ) as HTMLInputElement | null;
        if (apiKeyInput) state.apiKey = apiKeyInput.value;
        state.provider = card.dataset.provider as ProviderPreset["key"];
        render();
      });
    });

    if (state.step === 2) void populateMicSelect();
  }

  async function saveOnboarding(settings: Parameters<typeof window.typeless.setSettings>[0], buttonId: string) {
    const button = document.getElementById(buttonId) as HTMLButtonElement | null;
    const error = document.getElementById("ob-save-error");
    if (button) button.disabled = true;
    if (error) error.textContent = "";
    try {
      await window.typeless.setSettings(settings);
      teardownMic();
      await finishOnboarding();
    } catch {
      if (error) error.textContent = "บันทึกไม่สำเร็จ ตรวจสอบ API และปุ่มลัด แล้วลองอีกครั้ง";
    } finally {
      if (button) button.disabled = false;
    }
  }

  render();
}
