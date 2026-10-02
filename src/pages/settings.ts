import {
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  GEMINI_MODELS,
  type TranscriptionModel,
} from "../transcriptionModels";
import {
  BTN_PRIMARY,
  PAGE_TITLE,
  FIELD_LABEL,
  FIELD_INPUT,
  FIELD_SELECT,
} from "../uiClasses";
import { escapeHtml } from "../escape";

async function listMicDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch {
    // Permission denied or no mic — enumerateDevices below will just return unlabeled entries.
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}

type ProviderKey = "openai" | "openrouter" | "gemini" | "custom";

const PROVIDER_PRESETS: Record<
  Exclude<ProviderKey, "custom">,
  { baseUrl: string; models: TranscriptionModel[]; chatModel: string }
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    models: OPENAI_MODELS,
    chatModel: "gpt-4o-mini",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    models: OPENROUTER_MODELS,
    chatModel: "google/gemini-3.5-flash-lite",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: GEMINI_MODELS,
    chatModel: "gemini-3.5-flash-lite",
  },
};

// Keep in sync with TRANSLATE_LANGUAGES in electron/translate.ts.
const TRANSLATE_LANGUAGES: Record<string, string> = {
  en: "อังกฤษ",
  th: "ไทย",
  ja: "ญี่ปุ่น",
  zh: "จีน",
  ko: "เกาหลี",
  fr: "ฝรั่งเศส",
  de: "เยอรมัน",
  es: "สเปน",
  vi: "เวียดนาม",
};

function detectProvider(baseUrl: string): ProviderKey {
  if (baseUrl === PROVIDER_PRESETS.openai.baseUrl) return "openai";
  if (baseUrl === PROVIDER_PRESETS.openrouter.baseUrl) return "openrouter";
  if (baseUrl === PROVIDER_PRESETS.gemini.baseUrl) return "gemini";
  return "custom";
}

function modelFieldHtml(provider: ProviderKey, currentModel: string): string {
  if (provider === "custom") {
    return `
      <label class="${FIELD_LABEL}">
        Model
        <input id="model" type="text" value="${escapeHtml(currentModel)}" placeholder="whisper-1" class="${FIELD_INPUT}" />
      </label>
    `;
  }
  const models = PROVIDER_PRESETS[provider].models;
  return `
    <label class="${FIELD_LABEL}">
      Model
      <select id="model" class="${FIELD_SELECT}">
        ${models
          .map(
            (m) =>
              `<option value="${escapeHtml(m.id)}" ${m.id === currentModel ? "selected" : ""}>${escapeHtml(m.name)}</option>`,
          )
          .join("")}
      </select>
    </label>
  `;
}

export async function mountSettings(root: HTMLElement) {
  const current = await window.typeless.getSettings();
  const mics = await listMicDevices();
  let provider = detectProvider(current.apiBaseUrl);

  root.innerHTML = `
    <div class="mx-auto max-w-[920px]">
      <header class="mb-6">
        <h1 class="${PAGE_TITLE}">Settings</h1>
        <p class="mt-1 text-sm text-base-content/65">ตั้งค่าการถอดเสียง ผลลัพธ์ และอุปกรณ์ของ OpenPud</p>
      </header>
      <div class="grid items-start gap-5 lg:grid-cols-2">
      <section class="card card-border bg-base-100" aria-labelledby="provider-title">
      <div class="card-body gap-0 p-5">
      <h2 id="provider-title" class="mb-4 text-sm font-semibold">ผู้ให้บริการและโมเดล</h2>
      <label class="${FIELD_LABEL}">
        ผู้ให้บริการ
        <select id="provider-preset" class="${FIELD_SELECT}">
          <option value="openai" ${provider === "openai" ? "selected" : ""}>OpenAI (api.openai.com)</option>
          <option value="openrouter" ${provider === "openrouter" ? "selected" : ""}>OpenRouter (openrouter.ai)</option>
          <option value="gemini" ${provider === "gemini" ? "selected" : ""}>Gemini (Google AI Studio)</option>
          <option value="custom" ${provider === "custom" ? "selected" : ""}>กำหนดเอง</option>
        </select>
      </label>
      <label class="${FIELD_LABEL}">
        API Key
        <input id="apiKey" type="password" value="" placeholder="${current.hasApiKey ? "•••• บันทึกไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน" : provider === "gemini" ? "AIza..." : "sk-..."}" class="${FIELD_INPUT}" />
      </label>
      <label class="${FIELD_LABEL}">
        API Base URL
        <input id="apiBaseUrl" type="text" value="${escapeHtml(current.apiBaseUrl)}" ${provider !== "custom" ? "disabled" : ""} class="${FIELD_INPUT}" />
      </label>
      <div id="model-field">${modelFieldHtml(provider, current.model)}</div>
      <label class="${FIELD_LABEL}">
        ภาษา
        <select id="language" class="${FIELD_SELECT}">
          <option value="" ${current.language === "" ? "selected" : ""}>ไทย + อังกฤษ (แนะนำ)</option>
          <option value="th" ${current.language === "th" ? "selected" : ""}>ไทยเท่านั้น</option>
          <option value="en" ${current.language === "en" ? "selected" : ""}>อังกฤษเท่านั้น</option>
        </select>
      </label>
      <p class="-mt-3 mb-4 text-xs leading-relaxed text-base-content/65">
        โหมดแนะนำล็อกการรู้จำเป็นภาษาไทย (ไม่ปล่อย Whisper เดาเป็นญี่ปุ่น/เวียดนาม/เกาหลีเอง) แต่ยังใบ้ให้รองรับคำอังกฤษที่พูดแทรก — ถ้าพูดอังกฤษล้วนให้เลือก "อังกฤษเท่านั้น"
      </p>
      </div>
      </section>

      <div class="flex flex-col gap-5">
      <section class="card card-border bg-base-100" aria-labelledby="output-title">
      <div class="card-body gap-0 p-5">
      <h2 id="output-title" class="mb-4 text-sm font-semibold">ผลลัพธ์และการแปล</h2>
      <label class="${FIELD_LABEL}">
        แปลเป็นภาษา (โหมด Translate)
        <select id="translateTargetLang" class="${FIELD_SELECT}">
          ${Object.entries(TRANSLATE_LANGUAGES)
            .map(
              ([code, name]) =>
                `<option value="${code}" ${current.translateTargetLang === code ? "selected" : ""}>${name}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="mb-2 flex min-h-11 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg border border-base-300 px-3 text-[13px] text-base-content/75">
        <span>ตัดคำติดปากอัตโนมัติ <small class="block text-xs text-base-content/65">อืมม, เอ่ออ, um, uh — ไม่ใช้ AI</small></span>
        <input id="stripFillersEnabled" type="checkbox" class="toggle toggle-sm" ${current.stripFillersEnabled ? "checked" : ""} />
      </label>
      <label class="mb-4 flex min-h-11 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg border border-base-300 px-3 text-[13px] text-base-content/75">
        <span>ปรับข้อความด้วย AI <small class="block text-xs text-base-content/65">ใส่วรรคตอนและปรับโทนตามแอปปลายทาง</small></span>
        <input id="aiPolishEnabled" type="checkbox" class="toggle toggle-sm" ${current.aiPolishEnabled ? "checked" : ""} />
      </label>
      <label class="${FIELD_LABEL} mb-4">
        Chat model (ใช้กับ AI polish, Translate)
        <input id="chatModel" type="text" value="${escapeHtml(current.chatModel)}" placeholder="google/gemini-3.5-flash-lite" class="${FIELD_INPUT}" />
      </label>
      </div>
      </section>

      <section class="card card-border bg-base-100" aria-labelledby="device-title">
      <div class="card-body gap-0 p-5">
      <h2 id="device-title" class="mb-4 text-sm font-semibold">อุปกรณ์และระบบ</h2>
      <label class="${FIELD_LABEL}">
        ไมโครโฟน
        <select id="micDeviceId" class="${FIELD_SELECT}">
          <option value="">ค่าเริ่มต้นของระบบ</option>
          ${mics
            .map(
              (m, i) =>
                `<option value="${escapeHtml(m.deviceId)}" ${m.deviceId === current.micDeviceId ? "selected" : ""}>${escapeHtml(
                  m.label || `Microphone ${i + 1}`,
                )}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="${FIELD_LABEL}">
        ระยะเวลาอัดสูงสุด (วินาที)
        <input id="maxDurationSec" type="number" min="10" max="600" value="${current.maxDurationSec}" class="${FIELD_INPUT}" />
      </label>
      <label class="mb-2 flex min-h-11 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg border border-base-300 px-3 text-[13px] text-base-content/75">
        <span>เล่นเสียงเมื่อเริ่ม/หยุดอัด</span>
        <input id="playSound" type="checkbox" class="toggle toggle-sm" ${current.playSound ? "checked" : ""} />
      </label>
      <label class="mb-4 flex min-h-11 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg border border-base-300 px-3 text-[13px] text-base-content/75">
        <span>เปิดแอปอัตโนมัติเมื่อเปิดเครื่อง</span>
        <input id="launchAtStartup" type="checkbox" class="toggle toggle-sm" ${current.launchAtStartup ? "checked" : ""} />
      </label>
      </div>
      </section>
      </div>
      </div>
      <div class="mt-5 flex items-center justify-end gap-3">
        <p id="save-msg" class="min-h-4 text-xs" role="status" aria-live="polite"></p>
        <button id="save-btn" class="${BTN_PRIMARY} px-5">บันทึกการตั้งค่า</button>
      </div>
    </div>
  `;

  const providerPreset = document.getElementById(
    "provider-preset",
  ) as HTMLSelectElement;
  const apiBaseUrlInput = document.getElementById(
    "apiBaseUrl",
  ) as HTMLInputElement;
  const modelField = document.getElementById("model-field")!;
  const saveBtn = document.getElementById("save-btn")!;
  const msg = document.getElementById("save-msg")!;

  providerPreset.addEventListener("change", () => {
    provider = providerPreset.value as ProviderKey;
    const chatModelInput = document.getElementById(
      "chatModel",
    ) as HTMLInputElement;
    const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
    if (provider !== "custom") {
      apiBaseUrlInput.value = PROVIDER_PRESETS[provider].baseUrl;
      apiBaseUrlInput.disabled = true;
      modelField.innerHTML = modelFieldHtml(
        provider,
        PROVIDER_PRESETS[provider].models[0].id,
      );
      chatModelInput.value = PROVIDER_PRESETS[provider].chatModel;
    } else {
      apiBaseUrlInput.disabled = false;
      modelField.innerHTML = modelFieldHtml(provider, "");
    }
    if (!current.hasApiKey) {
      apiKeyInput.placeholder = provider === "gemini" ? "AIza..." : "sk-...";
    }
  });

  saveBtn.addEventListener("click", async () => {
    (saveBtn as HTMLButtonElement).disabled = true;
    msg.className = "min-h-4 text-xs text-base-content/65";
    msg.textContent = "กำลังบันทึก…";
    const apiKey = (
      document.getElementById("apiKey") as HTMLInputElement
    ).value.trim();
    const apiBaseUrl = apiBaseUrlInput.value.trim();
    const model = (
      document.getElementById("model") as HTMLInputElement | HTMLSelectElement
    ).value.trim();
    const language = (
      document.getElementById("language") as HTMLSelectElement
    ).value;
    const translateTargetLang = (
      document.getElementById("translateTargetLang") as HTMLSelectElement
    ).value;
    const stripFillersEnabled = (
      document.getElementById("stripFillersEnabled") as HTMLInputElement
    ).checked;
    const aiPolishEnabled = (
      document.getElementById("aiPolishEnabled") as HTMLInputElement
    ).checked;
    const chatModel = (
      document.getElementById("chatModel") as HTMLInputElement
    ).value.trim();
    const micDeviceId = (
      document.getElementById("micDeviceId") as HTMLSelectElement
    ).value;
    const maxDurationSec =
      Number(
        (document.getElementById("maxDurationSec") as HTMLInputElement).value,
      ) || 120;
    const playSound = (document.getElementById("playSound") as HTMLInputElement)
      .checked;
    const launchAtStartup = (
      document.getElementById("launchAtStartup") as HTMLInputElement
    ).checked;

    try {
      await window.typeless.setSettings({
        // Blank apiKey field means "keep the saved key" — the form no longer
        // pre-fills it since settings:get redacts the key.
        ...(apiKey ? { apiKey } : {}),
        apiBaseUrl,
        model,
        language,
        translateTargetLang,
        stripFillersEnabled,
        aiPolishEnabled,
        chatModel,
        micDeviceId,
        maxDurationSec,
        playSound,
        launchAtStartup,
      });
      msg.className = "min-h-4 text-xs text-success";
      msg.textContent = "บันทึกแล้ว";
    } catch (err) {
      console.error(err);
      msg.className = "min-h-4 text-xs text-error";
      // IPC rejections arrive as "Error invoking remote method ...: Error: <reason>"
      const reason = err instanceof Error ? err.message.split(/Error: /).pop() : "";
      msg.textContent = reason || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";
    } finally {
      (saveBtn as HTMLButtonElement).disabled = false;
      setTimeout(() => (msg.textContent = ""), 4000);
    }
  });
}
