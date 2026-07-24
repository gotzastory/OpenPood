interface ProviderPreset {
  key: "openai" | "openrouter";
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
    key: "openai",
    name: "OpenAI",
    sub: "api.openai.com · whisper-1",
    baseUrl: "https://api.openai.com/v1",
    model: "whisper-1",
  },
];

const CHAT_MODEL_BY_PROVIDER: Record<ProviderPreset["key"], string> = {
  openrouter: "google/gemini-3.5-flash-lite",
  openai: "gpt-4o-mini",
};

const TOTAL_STEPS = 4;

const FIELD_LABEL =
  "block font-mono text-[11px] tracking-wider text-paper/55 uppercase mb-2";
const FIELD_INPUT =
  "w-full rounded-lg border border-paper/10 bg-ink-raised px-3.5 py-3 font-mono text-sm text-paper outline-none transition focus:border-coral focus:shadow-[0_0_0_3px_rgba(255,78,51,0.16)] placeholder:text-paper/30";
const BTN_PRIMARY =
  "rounded-full bg-coral px-7.5 py-3.5 font-mono text-[13px] font-bold tracking-wider text-[#1a0d09] uppercase transition hover:shadow-[0_6px_20px_rgba(255,78,51,0.35)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";
const BTN_GHOST =
  "px-1 py-3.5 font-mono text-[13px] tracking-wider text-paper/55 uppercase hover:text-paper";

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
      : "openrouter",
    apiKey: existing.apiKey,
    micDeviceId: existing.micDeviceId,
    hotkey: existing.hotkey || "Control+Space",
  };

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
      const delay = (i * 0.06).toFixed(2);
      return `<span class="w-1 rounded-sm bg-gradient-to-b from-coral to-coral/25 [animation:ob-wave_1.4s_ease-in-out_infinite]" style="--h:${h}px;animation-delay:${delay}s"></span>`;
    }).join("");
    return `<div class="mb-10 mt-2 flex h-16 items-end gap-1">${bars}</div>`;
  }

  function render() {
    root.innerHTML = `
      <div class="ob-root relative flex h-full w-full flex-col overflow-hidden bg-ink font-display text-paper">
        <div class="relative z-10 flex items-center justify-between px-8 py-5 font-mono text-[11px] tracking-wider text-paper/55 uppercase">
          <div class="flex gap-1.5">
            ${Array.from({ length: TOTAL_STEPS })
              .map(
                (_, i) =>
                  `<div class="h-[3px] w-[22px] rounded-sm transition-colors duration-300 ${i < state.step ? "bg-coral" : i === state.step ? "bg-paper" : "bg-paper/10"}"></div>`,
              )
              .join("")}
          </div>
          <button class="cursor-pointer border-none bg-none font-mono text-[11px] tracking-wider text-paper/55 uppercase hover:text-paper" id="ob-skip">ข้ามไปก่อน</button>
        </div>
        <div class="relative z-10 flex flex-1 items-center justify-center px-12 pb-12">
          <div class="ob-panel w-full max-w-[620px]" id="ob-panel">${renderStep()}</div>
        </div>
      </div>
    `;

    document.getElementById("ob-skip")?.addEventListener("click", async () => {
      await window.typeless.setSettings({ onboardingCompleted: true });
      finishOnboarding();
    });

    wireStep();
  }

  function renderStep(): string {
    if (state.step === 0) {
      return `
        ${heroWaveHtml()}
        <h1 class="mb-4.5 text-[44px] font-semibold leading-[1.08] tracking-tight">พูด แล้วให้ตัวอักษร<br /><em class="italic font-normal text-coral">ตามทัน</em></h1>
        <p class="mb-9 max-w-[460px] font-mono text-[13.5px] leading-[1.7] text-paper/55">กด hotkey ครั้งเดียว พูดสิ่งที่คิด แล้วมันจะถูกพิมพ์ให้ที่ตำแหน่ง cursor ทันที — ไม่ต้องพิมพ์เองอีกต่อไป ตั้งค่า 3 ขั้นตอนสั้นๆ ก่อนเริ่มใช้งานจริง</p>
        <div class="mt-2 flex items-center gap-4">
          <button class="${BTN_PRIMARY}" id="ob-next">เริ่มตั้งค่า</button>
        </div>
      `;
    }

    if (state.step === 1) {
      return `
        <div class="mb-4 font-mono text-[11px] tracking-[0.14em] text-coral uppercase">ขั้นตอนที่ 2 จาก ${TOTAL_STEPS}</div>
        <h1 class="mb-4.5 text-[44px] font-semibold leading-[1.08] tracking-tight">เสียงของคุณจะถูกส่งไป<br /><em class="italic font-normal text-coral">ที่ไหน</em></h1>
        <p class="mb-9 max-w-[460px] font-mono text-[13.5px] leading-[1.7] text-paper/55">เลือกผู้ให้บริการแปลงเสียงเป็นข้อความ แล้วใส่ API Key ของคุณ — ข้อมูลถูกเก็บไว้ในเครื่องเท่านั้น</p>
        <div class="mb-5 grid grid-cols-2 gap-3">
          ${PROVIDERS.map(
            (p) => `
            <div class="ob-provider-card cursor-pointer rounded-[10px] border bg-ink-raised p-4.5 transition hover:-translate-y-0.5 ${state.provider === p.key ? "border-coral shadow-[0_0_0_1px_var(--color-coral)]" : "border-paper/10"}" data-provider="${p.key}">
              <h4 class="mb-1 text-base font-semibold">${p.name}</h4>
              <p class="font-mono text-[11px] text-paper/55">${p.sub}</p>
            </div>
          `,
          ).join("")}
        </div>
        <div class="mb-4.5">
          <label class="${FIELD_LABEL}">API Key</label>
          <input id="ob-apikey" type="password" placeholder="sk-..." value="${state.apiKey}" class="${FIELD_INPUT}" />
        </div>
        <div id="ob-error"></div>
        <div class="mt-2 flex items-center gap-4">
          <button class="${BTN_GHOST}" id="ob-back">ย้อนกลับ</button>
          <button class="${BTN_PRIMARY}" id="ob-next">ถัดไป</button>
        </div>
      `;
    }

    if (state.step === 2) {
      return `
        <div class="mb-4 font-mono text-[11px] tracking-[0.14em] text-coral uppercase">ขั้นตอนที่ 3 จาก ${TOTAL_STEPS}</div>
        <h1 class="mb-4.5 text-[44px] font-semibold leading-[1.08] tracking-tight">ให้เรา<br /><em class="italic font-normal text-coral">ฟังเสียง</em>คุณหน่อย</h1>
        <p class="mb-9 max-w-[460px] font-mono text-[13.5px] leading-[1.7] text-paper/55">เลือกไมโครโฟน แล้วลองพูดดู — แถบคลื่นเสียงด้านล่างจะขยับตามเสียงจริงของคุณ</p>
        <div class="mb-4.5">
          <label class="${FIELD_LABEL}">ไมโครโฟน</label>
          <select id="ob-mic" class="${FIELD_INPUT}"><option value="">กำลังโหลด...</option></select>
        </div>
        <div id="ob-mic-status" class="mb-5.5 flex items-center gap-2 font-mono text-xs text-paper/55">
          <span class="dot h-2 w-2 rounded-full bg-neutral-600 transition-colors"></span>
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
      <div class="mb-4 font-mono text-[11px] tracking-[0.14em] text-coral uppercase">ขั้นตอนที่ 4 จาก ${TOTAL_STEPS}</div>
      <h1 class="mb-4.5 text-[44px] font-semibold leading-[1.08] tracking-tight">จำ shortcut<br />นี้ไว้<em class="italic font-normal text-coral">.</em></h1>
      <p class="mb-9 max-w-[460px] font-mono text-[13.5px] leading-[1.7] text-paper/55">กดปุ่มนี้ที่ไหนก็ได้ในระบบเพื่อเริ่มพูด กดอีกครั้งเพื่อหยุดและส่งข้อความ — เปลี่ยนได้ทีหลังในหน้า Settings</p>
      <div class="mb-6.5 flex gap-2.5">${keys
        .map(
          (k) =>
            `<span class="rounded-lg border-[1.5px] border-paper/10 bg-ink-raised px-4.5 py-3 font-mono text-[15px] font-bold shadow-[0_3px_0_rgba(245,239,230,0.1)]">${k}</span>`,
        )
        .join('<span class="self-center text-paper/55">+</span>')}</div>
      <div class="mb-4.5">
        <label class="${FIELD_LABEL}">ปรับ Hotkey (ไม่บังคับ)</label>
        <input id="ob-hotkey" type="text" value="${state.hotkey}" placeholder="Control+Space" class="${FIELD_INPUT}" />
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
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audioinput",
    );
    select.innerHTML =
      `<option value="">ค่าเริ่มต้นของระบบ</option>` +
      devices
        .map(
          (d, i) =>
            `<option value="${d.deviceId}" ${d.deviceId === state.micDeviceId ? "selected" : ""}>${d.label || `Microphone ${i + 1}`}</option>`,
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
          "bg-coral",
          "shadow-[0_0_0_4px_rgba(255,78,51,0.16)]",
        );
        statusDot?.classList.remove("bg-neutral-600");
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
          ctx.fillStyle = "#ff4e33";
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
        if (!apiKey) {
          document.getElementById("ob-error")!.innerHTML =
            `<p class="-mt-2 mb-4 font-mono text-xs text-coral">ใส่ API Key ก่อนเพื่อไปต่อ</p>`;
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
        await window.typeless.setSettings({
          apiKey: state.apiKey,
          apiBaseUrl: preset.baseUrl,
          model: preset.model,
          chatModel: CHAT_MODEL_BY_PROVIDER[state.provider],
          micDeviceId: state.micDeviceId,
          hotkey: state.hotkey,
          onboardingCompleted: true,
        });
        finishOnboarding();
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

    if (state.step === 2) populateMicSelect();
  }

  render();
}
