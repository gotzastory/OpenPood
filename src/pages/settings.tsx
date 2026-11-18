import { useEffect, useState } from "react";
import { UpdatePanel } from '../components/UpdatePanel';
import { RUNTIME } from '../lib/runtimeConfig';
import type { AppSettings } from "../types";
import { ELEVENLABS_API_BASE, ELEVENLABS_STT_ONLY_MESSAGE, isElevenLabsProvider } from "../lib/elevenlabs";
import {
  GEMINI_MODELS,
  ELEVENLABS_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  type TranscriptionModel,
} from "../lib/transcriptionModels";
import { StatusToast } from "../components/StatusToast";
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
  | "saveHistory"
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const probe = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      // Also stops a stream granted after timeout or page unmount.
      stream.getTracks().forEach((track) => track.stop());
    }).catch(() => undefined);
    await Promise.race([probe, new Promise<void>((resolve) => { timer = setTimeout(resolve, RUNTIME.micStartTimeoutMs); })]);
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  } catch {
    return [];
  } finally { clearTimeout(timer); }
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
    saveHistory: settings.saveHistory,
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
    void window.typeless.getSettings()
      .then((settings) => {
        if (!active) return;
        setForm(initialForm(settings));
        setProvider(detectProvider(settings.apiBaseUrl));
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setLoadingError(true);
      });
    void listMicDevices().then((devices) => { if (active) setMics(devices); });

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
        saveHistory: form.saveHistory,
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

  return (
    <div className="settings-page mx-auto w-full">
      <header className="mb-4">
        <h1 className={PAGE_TITLE}>การตั้งค่า</h1>
        <p className="mt-1 text-sm text-secondary">
          ตั้งค่าการถอดเสียง ผลลัพธ์ และอุปกรณ์ของ OpenPood
        </p>
      </header>

      <div className="settings-columns">
        <fieldset className="fieldset rounded-box border border-base-300 bg-base-100 p-4" aria-labelledby="provider-title">
          <legend id="provider-title" className="fieldset-legend text-base font-semibold">ผู้ให้บริการและโมเดล</legend>
          <label className={FIELD_LABEL} htmlFor="settings-provider">ผู้ให้บริการ</label>
          <select
            id="settings-provider"
            className={FIELD_SELECT}
            value={provider}
            onChange={(event) => changeProvider(event.target.value as ProviderKey)}
          >
            <option value="openai">OpenAI (api.openai.com)</option>
            <option value="openrouter">OpenRouter (openrouter.ai)</option>
            <option value="gemini">Gemini (Google AI Studio)</option>
            <option value="elevenlabs">ElevenLabs (Speech to Text)</option>
            <option value="custom">กำหนดเอง</option>
          </select>
          <label className={FIELD_LABEL} htmlFor="settings-api-key">API Key</label>
          <input
            id="settings-api-key"
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
          <label className={FIELD_LABEL} htmlFor="settings-base-url">API Base URL</label>
          <input
            id="settings-base-url"
            className={FIELD_INPUT}
            type="text"
            value={form.apiBaseUrl}
            disabled={provider !== "custom"}
            onChange={(event) => update("apiBaseUrl", event.target.value)}
          />
          <label className={FIELD_LABEL} htmlFor="settings-model">Model</label>
          {provider === "custom" ? (
            <input
              id="settings-model"
              className={FIELD_INPUT}
              type="text"
              value={form.model}
              onChange={(event) => update("model", event.target.value)}
              placeholder="whisper-1"
            />
          ) : (
            <select
              id="settings-model"
              className={FIELD_SELECT}
              value={form.model}
              onChange={(event) => update("model", event.target.value)}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          )}
          <label className={FIELD_LABEL} htmlFor="settings-language">ภาษา</label>
          <select
            id="settings-language"
            className={FIELD_SELECT}
            value={form.language}
            onChange={(event) => update("language", event.target.value)}
          >
            <option value="">ไทย + อังกฤษ (แนะนำ)</option>
            <option value="th">ไทยเท่านั้น</option>
            <option value="en">อังกฤษเท่านั้น</option>
          </select>
          <p className="label px-0 text-xs font-normal text-secondary">
            โหมดแนะนำช่วยรองรับคำพูดหลายภาษา หากพูดภาษาเดียวเป็นหลัก ให้เลือกภาษานั้นเพื่อช่วยความแม่นยำ
          </p>
          {sttOnly && (
            <div role="status" className="alert alert-info alert-soft mt-2 text-sm">
              {ELEVENLABS_STT_ONLY_MESSAGE} · Dictionary ใช้กฎแก้คำในเครื่อง; ยังไม่ส่งคำศัพท์เป็น keyterms
            </div>
          )}
        </fieldset>

        <div className="settings-columns-side">
        <fieldset className="fieldset rounded-box border border-base-300 bg-base-100 p-4" aria-labelledby="output-title">
          <legend id="output-title" className="fieldset-legend text-base font-semibold">ผลลัพธ์และการแปล</legend>
          <label className={FIELD_LABEL} htmlFor="settings-translate">แปลเป็นภาษา (โหมด Translate)</label>
          <select
            id="settings-translate"
            className={FIELD_SELECT}
            value={form.translateTargetLang}
            disabled={sttOnly}
            onChange={(event) => update("translateTargetLang", event.target.value)}
          >
            {Object.entries(TRANSLATE_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
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
          <label className={FIELD_LABEL} htmlFor="settings-chat-model">Chat model (ใช้กับ AI polish และ Translate)</label>
          <input
            id="settings-chat-model"
            className={FIELD_INPUT}
            type="text"
            value={form.chatModel}
            disabled={sttOnly}
            onChange={(event) => update("chatModel", event.target.value)}
            placeholder="google/gemini-3.5-flash-lite"
          />
        </fieldset>

        <fieldset className="fieldset rounded-box border border-base-300 bg-base-100 p-4" aria-labelledby="device-title">
          <legend id="device-title" className="fieldset-legend text-base font-semibold">อุปกรณ์และระบบ</legend>
          <label className={FIELD_LABEL} htmlFor="settings-mic">ไมโครโฟน</label>
          <select
            id="settings-mic"
            className={FIELD_SELECT}
            value={form.micDeviceId}
            onChange={(event) => update("micDeviceId", event.target.value)}
          >
            <option value="">ค่าเริ่มต้นของระบบ</option>
            {mics.map((mic, index) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
          <label className={FIELD_LABEL} htmlFor="settings-duration">
            ระยะเวลาอัดสูงสุด <span className="badge badge-soft badge-sm ml-1">{form.maxDurationSec} วินาที</span>
          </label>
          <input
            id="settings-duration"
            className="range range-primary range-sm"
            type="range"
            min={10}
            max={600}
            step={10}
            value={form.maxDurationSec}
            aria-valuetext={`${form.maxDurationSec} วินาที`}
            onChange={(event) => update("maxDurationSec", Number(event.target.value))}
          />
          <div className="flex justify-between px-1 text-xs text-secondary">
            <span>10 วินาที</span>
            <span>600 วินาที</span>
          </div>
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
          <Toggle
            label="บันทึกประวัติการถอดเสียง"
            hint="ข้อความถูกเข้ารหัสเก็บในเครื่องนี้ ปิดแล้วจะไม่เก็บข้อความใหม่ ประวัติเดิมล้างได้ที่หน้าประวัติ"
            checked={form.saveHistory}
            onChange={(value) => update("saveHistory", value)}
          />
        </fieldset>
        </div>
      </div>

      <UpdatePanel />

      <div className="mt-4 flex items-center justify-end border-t border-base-300 py-3">
        <button
          type="button"
          className={`${BTN_PRIMARY} px-5`}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving && <span className="loading loading-spinner loading-xs" aria-hidden="true" />}
          {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
      </div>
      <StatusToast text={message.text} kind={message.kind} />
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
    <label className="label mt-2 cursor-pointer justify-between gap-4 rounded-lg border border-base-300 px-3 py-2">
      <span>
        <span className="block font-medium text-base-content">{label}</span>
        {hint && <span className="block text-xs font-normal text-secondary">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
