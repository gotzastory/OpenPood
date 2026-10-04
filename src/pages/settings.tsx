import { useEffect, useState } from "react";
import type { AppSettings } from "../types";
import { ELEVENLABS_API_BASE, ELEVENLABS_STT_ONLY_MESSAGE, isElevenLabsProvider } from "../lib/elevenlabs";
import {
  GEMINI_MODELS,
  ELEVENLABS_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  type TranscriptionModel,
} from "../lib/transcriptionModels";
import {
  BTN_PRIMARY,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_SELECT,
  PAGE_TITLE,
} from "../lib/uiClasses";

type ProviderKey = "openai" | "openrouter" | "gemini" | "elevenlabs" | "custom";

type SettingsForm = Pick<
  AppSettings,
  | "apiBaseUrl"
  | "model"
  | "language"
  | "translateTargetLang"
  | "stripFillersEnabled"
  | "aiPolishEnabled"
  | "chatModel"
  | "micDeviceId"
  | "maxDurationSec"
  | "playSound"
  | "launchAtStartup"
> & { apiKey: string; hasApiKey: boolean };

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
  elevenlabs: {
    baseUrl: ELEVENLABS_API_BASE,
    models: ELEVENLABS_MODELS,
    chatModel: "",
  },
};

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
  if (isElevenLabsProvider({ apiBaseUrl: baseUrl })) return "elevenlabs";
  if (baseUrl === PROVIDER_PRESETS.openai.baseUrl) return "openai";
  if (baseUrl === PROVIDER_PRESETS.openrouter.baseUrl) return "openrouter";
  if (baseUrl === PROVIDER_PRESETS.gemini.baseUrl) return "gemini";
  return "custom";
}

async function listMicDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  } catch {
    return [];
  }
}

function initialForm(settings: AppSettings): SettingsForm {
  return {
    apiKey: "",
    hasApiKey: settings.hasApiKey,
    apiBaseUrl: settings.apiBaseUrl,
    model: settings.model,
    language: settings.language,
    translateTargetLang: settings.translateTargetLang,
    stripFillersEnabled: settings.stripFillersEnabled,
    aiPolishEnabled: settings.aiPolishEnabled,
    chatModel: settings.chatModel,
    micDeviceId: settings.micDeviceId,
    maxDurationSec: settings.maxDurationSec,
    playSound: settings.playSound,
    launchAtStartup: settings.launchAtStartup,
  };
}

export function SettingsPage() {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [provider, setProvider] = useState<ProviderKey>("custom");
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [loadingError, setLoadingError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    kind: "idle" | "success" | "error";
  }>({ text: "", kind: "idle" });

  useEffect(() => {
    let active = true;
    void Promise.all([window.typeless.getSettings(), listMicDevices()])
      .then(([settings, devices]) => {
        if (!active) return;
        setForm(initialForm(settings));
        setProvider(detectProvider(settings.apiBaseUrl));
        setMics(devices);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setLoadingError(true);
      });

    document.getElementById("content")?.focus({ preventScroll: true });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const changeProvider = (nextProvider: ProviderKey) => {
    setProvider(nextProvider);
    if (nextProvider === "custom") {
      update("apiBaseUrl", form?.apiBaseUrl ?? "");
      update("model", "");
      return;
    }
    const preset = PROVIDER_PRESETS[nextProvider];
    setForm((current) =>
      current
        ? {
            ...current,
            apiBaseUrl: preset.baseUrl,
            model: preset.models[0].id,
            chatModel: preset.chatModel,
            aiPolishEnabled: nextProvider === "elevenlabs" ? false : current.aiPolishEnabled,
          }
        : current,
    );
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage({ text: "กำลังบันทึก…", kind: "idle" });
    try {
      const next = await window.typeless.setSettings({
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        apiBaseUrl: form.apiBaseUrl.trim(),
        model: form.model.trim(),
        language: form.language,
        translateTargetLang: form.translateTargetLang,
        stripFillersEnabled: form.stripFillersEnabled,
        aiPolishEnabled: isElevenLabsProvider(form) ? false : form.aiPolishEnabled,
        chatModel: form.chatModel.trim(),
        micDeviceId: form.micDeviceId,
        maxDurationSec: Number(form.maxDurationSec) || 120,
        playSound: form.playSound,
        launchAtStartup: form.launchAtStartup,
      });
      setForm(initialForm(next));
      setProvider(detectProvider(next.apiBaseUrl));
      setMessage({ text: "บันทึกแล้ว", kind: "success" });
    } catch (error: unknown) {
      console.error(error);
      const reason =
        error instanceof Error ? error.message.split(/Error: /).pop() : "";
      setMessage({
        text: reason || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
        kind: "error",
      });
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage({ text: "", kind: "idle" }), 4000);
    }
  };

  if (loadingError) {
    return (
      <div
        role="alert"
        className="alert alert-error alert-soft mx-auto max-w-xl text-sm"
      >
        เปิดหน้า Settings ไม่สำเร็จ กรุณาลองใหม่
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-[920px] text-sm text-base-content/65">
        กำลังโหลด Settings…
      </div>
    );
  }

  const models = provider === "custom" ? [] : PROVIDER_PRESETS[provider].models;
  const sttOnly = isElevenLabsProvider(form);
  const statusClass =
    message.kind === "success"
      ? "text-success"
      : message.kind === "error"
        ? "text-error"
        : "text-base-content/65";

  return (
    <div className="mx-auto max-w-[920px]">
      <header className="mb-6">
        <h1 className={PAGE_TITLE}>การตั้งค่า</h1>
        <p className="mt-1 text-sm text-base-content/65">
          ตั้งค่าการถอดเสียง ผลลัพธ์ และอุปกรณ์ของ OpenPood
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section
          className="card card-border bg-base-100"
          aria-labelledby="provider-title"
        >
          <div className="card-body gap-0 p-6">
            <h2 id="provider-title" className="mb-5 text-base font-semibold">
              ผู้ให้บริการและโมเดล
            </h2>
            <label className={FIELD_LABEL}>
              ผู้ให้บริการ
              <select
                className={FIELD_SELECT}
                value={provider}
                onChange={(event) =>
                  changeProvider(event.target.value as ProviderKey)
                }
              >
                <option value="openai">OpenAI (api.openai.com)</option>
                <option value="openrouter">OpenRouter (openrouter.ai)</option>
                <option value="gemini">Gemini (Google AI Studio)</option>
                <option value="elevenlabs">ElevenLabs (Speech to Text)</option>
                <option value="custom">กำหนดเอง</option>
              </select>
            </label>
            <label className={FIELD_LABEL}>
              API Key
              <input
                className={FIELD_INPUT}
                type="password"
                value={form.apiKey}
                onChange={(event) => update("apiKey", event.target.value)}
                placeholder={
                  form.hasApiKey
                    ? "•••• บันทึกไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน"
                    : provider === "gemini"
                      ? "AIza..."
                      : sttOnly ? "ElevenLabs API key"
                      : "sk-..."
                }
              />
            </label>
            <label className={FIELD_LABEL}>
              API Base URL
              <input
                className={FIELD_INPUT}
                type="text"
                value={form.apiBaseUrl}
                disabled={provider !== "custom"}
                onChange={(event) => update("apiBaseUrl", event.target.value)}
              />
            </label>
            <label className={FIELD_LABEL}>
              Model
              {provider === "custom" ? (
                <input
                  className={FIELD_INPUT}
                  type="text"
                  value={form.model}
                  onChange={(event) => update("model", event.target.value)}
                  placeholder="whisper-1"
                />
              ) : (
                <select
                  className={FIELD_SELECT}
                  value={form.model}
                  onChange={(event) => update("model", event.target.value)}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className={FIELD_LABEL}>
              ภาษา
              <select
                className={FIELD_SELECT}
                value={form.language}
                onChange={(event) => update("language", event.target.value)}
              >
                <option value="">ไทย + อังกฤษ (แนะนำ)</option>
                <option value="th">ไทยเท่านั้น</option>
                <option value="en">อังกฤษเท่านั้น</option>
              </select>
            </label>
            <p className="-mt-3 text-xs leading-relaxed text-base-content/65">
              โหมดแนะนำช่วยรองรับคำพูดหลายภาษา หากพูดภาษาเดียวเป็นหลัก
              ให้เลือกภาษานั้นเพื่อช่วยความแม่นยำ
            </p>
            {sttOnly && (
              <p className="mt-3 text-xs leading-relaxed text-base-content/65">
                {ELEVENLABS_STT_ONLY_MESSAGE} · Dictionary ใช้กฎแก้คำในเครื่อง;
                ยังไม่ส่งคำศัพท์เป็น keyterms
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section
            className="card card-border bg-base-100"
            aria-labelledby="output-title"
          >
            <div className="card-body gap-0 p-6">
              <h2 id="output-title" className="mb-5 text-base font-semibold">
                ผลลัพธ์และการแปล
              </h2>
              <label className={FIELD_LABEL}>
                แปลเป็นภาษา (โหมด Translate)
                <select
                  className={FIELD_SELECT}
                  value={form.translateTargetLang}
                  disabled={sttOnly}
                  onChange={(event) =>
                    update("translateTargetLang", event.target.value)
                  }
                >
                  {Object.entries(TRANSLATE_LANGUAGES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle
                label="ตัดคำติดปากอัตโนมัติ"
                hint="อืม, เอ่อ, um, uh — ไม่ใช้ AI"
                checked={form.stripFillersEnabled}
                onChange={(value) => update("stripFillersEnabled", value)}
              />
              <Toggle
                label="ปรับข้อความด้วย AI"
                hint="ใส่วรรคตอนและปรับโทนตามแอปปลายทาง"
                checked={!sttOnly && form.aiPolishEnabled}
                disabled={sttOnly}
                onChange={(value) => update("aiPolishEnabled", value)}
              />
              <label className={`${FIELD_LABEL} mb-0`}>
                Chat model (ใช้กับ AI polish และ Translate)
                <input
                  className={FIELD_INPUT}
                  type="text"
                  value={form.chatModel}
                  disabled={sttOnly}
                  onChange={(event) => update("chatModel", event.target.value)}
                  placeholder="google/gemini-3.5-flash-lite"
                />
              </label>
            </div>
          </section>

          <section
            className="card card-border bg-base-100"
            aria-labelledby="device-title"
          >
            <div className="card-body gap-0 p-6">
              <h2 id="device-title" className="mb-5 text-base font-semibold">
                อุปกรณ์และระบบ
              </h2>
              <label className={FIELD_LABEL}>
                ไมโครโฟน
                <select
                  className={FIELD_SELECT}
                  value={form.micDeviceId}
                  onChange={(event) =>
                    update("micDeviceId", event.target.value)
                  }
                >
                  <option value="">ค่าเริ่มต้นของระบบ</option>
                  {mics.map((mic, index) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_LABEL}>
                ระยะเวลาอัดสูงสุด (วินาที)
                <input
                  className={FIELD_INPUT}
                  type="number"
                  min="10"
                  max="600"
                  value={form.maxDurationSec}
                  onChange={(event) =>
                    update("maxDurationSec", Number(event.target.value))
                  }
                />
              </label>
              <Toggle
                label="เล่นเสียงเมื่อเริ่ม/หยุดอัด"
                checked={form.playSound}
                onChange={(value) => update("playSound", value)}
              />
              <Toggle
                label="เปิดแอปอัตโนมัติเมื่อเปิดเครื่อง"
                checked={form.launchAtStartup}
                onChange={(value) => update("launchAtStartup", value)}
              />
            </div>
          </section>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <p
          className={`min-h-4 text-xs ${statusClass}`}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </p>
        <button
          type="button"
          className={`${BTN_PRIMARY} px-5`}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="mb-4 flex min-h-11 cursor-pointer flex-row items-center justify-between gap-4 rounded-lg border border-base-300 px-3 text-[13px] text-base-content/75">
      <span>
        {label}
        {hint && (
          <small className="block text-xs text-base-content/65">{hint}</small>
        )}
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary toggle-sm"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
