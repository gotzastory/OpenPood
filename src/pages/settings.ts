import {
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  type TranscriptionModel,
} from "../transcriptionModels";
import {
  BTN_PRIMARY,
  PAGE_TITLE,
  FIELD_LABEL,
  FIELD_INPUT,
  FIELD_SELECT,
} from "../uiClasses";

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

type ProviderKey = "openai" | "openrouter" | "custom";

const PROVIDER_PRESETS: Record<
  Exclude<ProviderKey, "custom">,
  { baseUrl: string; models: TranscriptionModel[] }
> = {
  openai: { baseUrl: "https://api.openai.com/v1", models: OPENAI_MODELS },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    models: OPENROUTER_MODELS,
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
  return "custom";
}

function modelFieldHtml(provider: ProviderKey, currentModel: string): string {
  if (provider === "custom") {
    return `
      <label class="${FIELD_LABEL}">
        Model
        <input id="model" type="text" value="${currentModel}" placeholder="whisper-1" class="${FIELD_INPUT}" />
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
              `<option value="${m.id}" ${m.id === currentModel ? "selected" : ""}>${m.name}</option>`,
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
    <h1 class="${PAGE_TITLE} mb-5">Settings</h1>
    <div class="max-w-[440px]">
      <label class="${FIELD_LABEL}">
        ผู้ให้บริการ
        <select id="provider-preset" class="${FIELD_SELECT}">
          <option value="openai" ${provider === "openai" ? "selected" : ""}>OpenAI (api.openai.com)</option>
          <option value="openrouter" ${provider === "openrouter" ? "selected" : ""}>OpenRouter (openrouter.ai)</option>
          <option value="custom" ${provider === "custom" ? "selected" : ""}>กำหนดเอง</option>
        </select>
      </label>
      <label class="${FIELD_LABEL}">
        API Key
        <input id="apiKey" type="password" value="${current.apiKey}" placeholder="sk-..." class="${FIELD_INPUT}" />
      </label>
      <label class="${FIELD_LABEL}">
        API Base URL
        <input id="apiBaseUrl" type="text" value="${current.apiBaseUrl}" ${provider !== "custom" ? "disabled" : ""} class="${FIELD_INPUT}" />
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
      <p class="-mt-3 mb-4 text-xs leading-relaxed text-neutral-400">
        โหมดแนะนำล็อกการรู้จำเป็นภาษาไทย (ไม่ปล่อย Whisper เดาเป็นญี่ปุ่น/เวียดนาม/เกาหลีเอง) แต่ยังใบ้ให้รองรับคำอังกฤษที่พูดแทรก — ถ้าพูดอังกฤษล้วนให้เลือก "อังกฤษเท่านั้น"
      </p>
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
      <label class="mb-1.5 flex flex-row items-center gap-2 text-[13px] text-neutral-600">
        <input id="aiPolishEnabled" type="checkbox" class="w-auto" ${current.aiPolishEnabled ? "checked" : ""} />
        ปรับข้อความด้วย AI หลัง Dictate (ตัดคำติดปาก ใส่วรรคตอน ปรับโทนตามแอปปลายทาง)
      </label>
      <label class="${FIELD_LABEL} mb-4">
        Chat model (ใช้กับ AI polish, Translate, Ask anything)
        <input id="chatModel" type="text" value="${current.chatModel}" placeholder="google/gemini-3.5-flash-lite" class="${FIELD_INPUT}" />
      </label>
      <label class="${FIELD_LABEL}">
        ไมโครโฟน
        <select id="micDeviceId" class="${FIELD_SELECT}">
          <option value="">ค่าเริ่มต้นของระบบ</option>
          ${mics
            .map(
              (m, i) =>
                `<option value="${m.deviceId}" ${m.deviceId === current.micDeviceId ? "selected" : ""}>${
                  m.label || `Microphone ${i + 1}`
                }</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="${FIELD_LABEL}">
        ระยะเวลาอัดสูงสุด (วินาที)
        <input id="maxDurationSec" type="number" min="10" max="600" value="${current.maxDurationSec}" class="${FIELD_INPUT}" />
      </label>
      <label class="mb-4 flex flex-row items-center gap-2 text-[13px] text-neutral-600">
        <input id="playSound" type="checkbox" class="w-auto" ${current.playSound ? "checked" : ""} />
        เล่นเสียงเมื่อเริ่ม/หยุดอัด
      </label>
      <label class="mb-4 flex flex-row items-center gap-2 text-[13px] text-neutral-600">
        <input id="launchAtStartup" type="checkbox" class="w-auto" ${current.launchAtStartup ? "checked" : ""} />
        เปิดแอปอัตโนมัติเมื่อเปิดเครื่อง
      </label>
      <button id="save-btn" class="${BTN_PRIMARY} px-4.5">บันทึก</button>
      <p id="save-msg" class="mt-1 h-4 text-xs"></p>
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
    if (provider !== "custom") {
      apiBaseUrlInput.value = PROVIDER_PRESETS[provider].baseUrl;
      apiBaseUrlInput.disabled = true;
      modelField.innerHTML = modelFieldHtml(
        provider,
        PROVIDER_PRESETS[provider].models[0].id,
      );
      chatModelInput.value =
        provider === "openrouter"
          ? "google/gemini-3.5-flash-lite"
          : "gpt-4o-mini";
    } else {
      apiBaseUrlInput.disabled = false;
      modelField.innerHTML = modelFieldHtml(provider, "");
    }
  });

  saveBtn.addEventListener("click", async () => {
    (saveBtn as HTMLButtonElement).disabled = true;
    msg.className = "mt-1 h-4 text-xs text-neutral-400";
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
        apiKey,
        apiBaseUrl,
        model,
        language,
        translateTargetLang,
        aiPolishEnabled,
        chatModel,
        micDeviceId,
        maxDurationSec,
        playSound,
        launchAtStartup,
      });
      msg.className = "mt-1 h-4 text-xs text-emerald-600";
      msg.textContent = "บันทึกแล้ว";
    } catch {
      msg.className = "mt-1 h-4 text-xs text-red-600";
      msg.textContent = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";
    } finally {
      (saveBtn as HTMLButtonElement).disabled = false;
      setTimeout(() => (msg.textContent = ""), 1500);
    }
  });
}
