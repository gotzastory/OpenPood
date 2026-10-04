import { useEffect, useRef, useState, type RefObject } from "react";
import { createRoot } from "react-dom/client";

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
    sub: "gemini-3.5-transcribe · gemini-3.5-flash-lite",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-3.5-transcribe",
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

const TOTAL_STEPS = 5;
const BTN_PRIMARY =
  "btn rounded-lg border-0 bg-blue px-7 py-3.5 font-display text-[13px] font-bold tracking-normal text-paper transition hover:shadow-[0_6px_20px_rgba(0,85,255,0.35)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";
const BTN_GHOST =
  "btn btn-ghost h-auto min-h-0 px-1 py-3.5 font-display text-[13px] font-normal tracking-normal text-paper/55 hover:bg-transparent hover:text-paper";
const FIELD_LABEL =
  "block font-display text-[11px] tracking-normal text-paper/55";
const FIELD_INPUT =
  "input h-auto min-h-0 w-full rounded-lg border border-paper/10 bg-ink-raised px-3.5 py-3 font-display text-sm text-paper outline-none transition focus:border-blue focus:shadow-[0_0_0_3px_rgba(0,85,255,0.16)] placeholder:text-paper/55";

interface OnboardingState {
  step: number;
  provider: ProviderPreset["key"];
  apiKey: string;
  micDeviceId: string;
  hotkey: string;
}

function providerFromUrl(baseUrl: string): ProviderPreset["key"] {
  if (baseUrl.includes("openai.com")) return "openai";
  if (baseUrl.includes("generativelanguage.googleapis.com")) return "gemini";
  return "openrouter";
}

function Waveform() {
  return (
    <div className="ob-waveform mb-10 mt-2 flex h-16 items-end gap-1" aria-hidden="true">
      {Array.from({ length: 22 }, (_, index) => (
        <span
          key={index}
          className="ob-waveform-bar w-1 rounded-full bg-blue"
          style={{
            height: `${14 + Math.round(Math.sin(index * 0.7) * 10 + 24)}px`,
            animationDelay: `calc(${index} * var(--ob-wave-stagger))`,
          }}
        />
      ))}
    </div>
  );
}

export function OnboardingPage() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micStatus, setMicStatus] = useState("ยังไม่ได้เชื่อมต่อ");
  const [micError, setMicError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loadingError, setLoadingError] = useState(false);
  const [saving, setSaving] = useState(false);
  const mediaRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    void window.typeless
      .getSettings()
      .then((existing) => {
        if (!active) return;
        setState({
          step: 0,
          provider: providerFromUrl(existing.apiBaseUrl),
          apiKey: "",
          micDeviceId: existing.micDeviceId,
          hotkey: existing.hotkey || "Control+Space",
        });
        setHasSavedApiKey(existing.hasApiKey);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setLoadingError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      void audioRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!state || state.step !== 2) return;
    let cancelled = false;
    if (!navigator.mediaDevices) {
      setMicError("เบราว์เซอร์ไม่รองรับการเข้าถึงไมโครโฟน");
      return;
    }
    void (async () => {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        probe.getTracks().forEach((track) => track.stop());
      } catch {
        // Permission denied: enumerateDevices may still return default entries.
      }
      const devices = await navigator.mediaDevices
        .enumerateDevices()
        .catch(() => [] as MediaDeviceInfo[]);
      if (!cancelled)
        setMics(devices.filter((device) => device.kind === "audioinput"));
    })();
    return () => {
      cancelled = true;
    };
  }, [state?.step]);

  useEffect(() => {
    if (!state || state.step !== 2 || !canvasRef.current) return;
    let cancelled = false;
    if (!navigator.mediaDevices) {
      setMicStatus("ยังไม่ได้เชื่อมต่อ");
      setMicError("เบราว์เซอร์ไม่รองรับการเข้าถึงไมโครโฟน");
      return;
    }
    cancelAnimationFrame(rafRef.current);
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    void audioRef.current?.close();
    mediaRef.current = null;
    audioRef.current = null;

    void navigator.mediaDevices
      .getUserMedia({
        audio: state.micDeviceId
          ? { deviceId: { exact: state.micDeviceId } }
          : true,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaRef.current = stream;
        const audio = new AudioContext();
        audioRef.current = audio;
        const source = audio.createMediaStreamSource(stream);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        setMicStatus("กำลังฟัง — ลองพูดดู");
        setMicError("");
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteFrequencyData(data);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue("--color-blue")
            .trim();
          const barCount = 40;
          const barWidth = 4;
          const gap = (canvas.width - barCount * barWidth) / (barCount - 1);
          for (let index = 0; index < barCount; index += 1) {
            const volume =
              data[Math.floor((index / barCount) * data.length)] / 255;
            const height = Math.max(3, volume * canvas.height);
            context.fillRect(
              index * (barWidth + gap),
              canvas.height / 2 - height / 2,
              barWidth,
              height,
            );
          }
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
      })
      .catch(() => {
        if (!cancelled) {
          setMicStatus("ยังไม่ได้เชื่อมต่อ");
          setMicError("เข้าถึงไมโครโฟนไม่ได้ ตรวจสอบสิทธิ์การใช้งาน");
        }
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      void audioRef.current?.close();
    };
  }, [state?.step, state?.micDeviceId]);

  const update = <K extends keyof OnboardingState>(
    key: K,
    value: OnboardingState[K],
  ) => {
    setState((current) => (current ? { ...current, [key]: value } : current));
  };

  const finish = async (
    settings: Parameters<typeof window.typeless.setSettings>[0],
    complete = true,
  ) => {
    setSaving(true);
    setSaveError("");
    try {
      const saved = await window.typeless.setSettings(settings);
      if (complete) {
        location.hash = "/";
        location.reload();
      } else {
        setHasSavedApiKey(saved.hasApiKey);
        setState((current) => current
          ? { ...current, apiKey: "", hotkey: saved.hotkey, step: TOTAL_STEPS - 1 }
          : current);
        setSaving(false);
      }
    } catch (error: unknown) {
      console.error(error);
      setSaveError("บันทึกไม่สำเร็จ ตรวจสอบ API และปุ่มลัด แล้วลองอีกครั้ง");
      setSaving(false);
    }
  };

  if (loadingError)
    return (
      <div className="ob-root flex h-full items-center justify-center bg-ink p-8 font-display text-paper">
        เปิดหน้าเริ่มต้นไม่สำเร็จ กรุณาลองใหม่
      </div>
    );
  if (!state)
    return (
      <div className="ob-root flex h-full items-center justify-center bg-ink p-8 font-display text-paper/55">
        กำลังเตรียม OpenPood…
      </div>
    );

  const provider =
    PROVIDERS.find((item) => item.key === state.provider) ?? PROVIDERS[0];
  const next = () => {
    if (state.step === 1 && !state.apiKey.trim() && !hasSavedApiKey) {
      setSaveError("ใส่ API Key ก่อนเพื่อไปต่อ");
      return;
    }
    setSaveError("");
    setState((current) =>
      current
        ? { ...current, step: Math.min(TOTAL_STEPS - 1, current.step + 1) }
        : current,
    );
  };

  return (
    <div className="ob-root relative flex h-full w-full flex-col overflow-y-auto bg-ink font-display text-paper">
      {/* Navbar */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 text-[11px] tracking-normal text-paper/55">
        <div className="flex shrink-0 items-center gap-2.5">
          <img
            src="./brand/openpood-symbol.png"
            alt=""
            aria-hidden="true"
            className="h-11 w-11"
            draggable={false}
          />
          <span className="text-2xl font-extrabold text-paper">OpenPood</span>
        </div>
        <div
          className="flex gap-1.5"
          role="img"
          aria-label={`ขั้นตอนที่ ${state.step + 1} จาก ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <div
              key={index}
              className={`h-[3px] w-[22px] rounded-sm transition-colors duration-300 ${index < state.step ? "bg-blue" : index === state.step ? "bg-paper" : "bg-paper/10"}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent text-[11px] text-paper/55 hover:text-paper"
          disabled={saving}
          onClick={() => void finish({ onboardingCompleted: true })}
        >
          ข้ามไปก่อน
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-8 py-6 lg:px-12 lg:pb-12">
        <div className="ob-panel w-full max-w-[620px]" tabIndex={-1}>
          {state.step === 0 && <WelcomeStep onNext={next} />}
          {state.step === 1 && (
            <ProviderStep
              state={state}
              hasSavedApiKey={hasSavedApiKey}
              onProviderChange={(value) => update("provider", value)}
              onApiKeyChange={(value) => update("apiKey", value)}
              onBack={() => update("step", 0)}
              onNext={next}
            />
          )}
          {state.step === 2 && (
            <MicrophoneStep
              state={state}
              mics={mics}
              status={micStatus}
              error={micError}
              canvasRef={canvasRef}
              onMicChange={(value) => update("micDeviceId", value)}
              onBack={() => update("step", 1)}
              onNext={next}
            />
          )}
          {state.step === 3 && (
            <HotkeyStep
              hotkey={state.hotkey}
              onHotkeyChange={(value) => update("hotkey", value)}
              onBack={() => update("step", 2)}
              onFinish={() =>
                void finish({
                  ...(state.apiKey.trim()
                    ? { apiKey: state.apiKey.trim() }
                    : {}),
                  apiBaseUrl: provider.baseUrl,
                  model: provider.model,
                  chatModel: CHAT_MODEL_BY_PROVIDER[state.provider],
                  micDeviceId: state.micDeviceId,
                  hotkey: state.hotkey.trim() || "Control+Space",
                }, false)
              }
              saving={saving}
            />
          )}
          {state.step === 4 && (
            <TestStep
              hotkey={state.hotkey}
              onBack={() => update("step", 3)}
              onFinish={() => void finish({ onboardingCompleted: true })}
              saving={saving}
            />
          )}
          <p role="alert" className="mt-4 text-sm text-paper">
            {saveError}
          </p>
        </div>
      </div>
    </div>
  );
}

function StepLabel({ step }: { step: number }) {
  return (
    <div className="mb-4 text-[11px] tracking-[0.14em] text-blue">
      ขั้นตอนที่ {step} จาก {TOTAL_STEPS}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <Waveform />
      <h1 className="mb-4 text-[36px] font-semibold leading-[1.08] tracking-tight lg:text-[44px]">
        พูด แล้วให้ตัวอักษร
        <br />
        <em className="not-italic font-semibold text-paper">ตามทัน</em>
      </h1>
      <p className="mb-6 max-w-[540px] text-[13.5px] leading-[1.7] text-paper/55">
        กด hotkey ครั้งเดียว พูดสิ่งที่คิด แล้วข้อความจะถูกพิมพ์ให้ที่ตำแหน่ง
        cursor ทันที ตั้งค่าไม่กี่ขั้นตอนก่อนเริ่มใช้งานจริง
      </p>
      <button type="button" className={BTN_PRIMARY} onClick={onNext}>
        เริ่มตั้งค่า
      </button>
    </>
  );
}

function ProviderStep({
  state,
  hasSavedApiKey,
  onProviderChange,
  onApiKeyChange,
  onBack,
  onNext,
}: {
  state: OnboardingState;
  hasSavedApiKey: boolean;
  onProviderChange: (provider: ProviderPreset["key"]) => void;
  onApiKeyChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <StepLabel step={2} />
      <h1 className="mb-4 text-[36px] font-semibold leading-[1.08] tracking-tight lg:text-[44px]">
        เสียงของคุณจะถูกส่งไป
        <br />
        <em className="not-italic font-semibold text-paper">ที่ไหน</em>
      </h1>
      <p className="mb-6 max-w-[540px] text-[13.5px] leading-[1.7] text-paper/55">
        เลือก API สำหรับถอดเสียง ใช้ API Key ของคุณเอง โดย key
        จะถูกเก็บในเครื่องและไม่แสดงกลับในฟอร์ม
      </p>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROVIDERS.map((item) => (
          <button
            type="button"
            key={item.key}
            aria-pressed={state.provider === item.key}
            className={`ob-provider-card cursor-pointer rounded-[10px] border bg-ink-raised p-4 text-left transition hover:border-paper/50 ${state.provider === item.key ? "border-blue shadow-[0_0_0_1px_var(--color-blue)]" : "border-paper/10"}`}
            onClick={() => onProviderChange(item.key)}
          >
            <span className="mb-1 block text-sm font-semibold">
              {item.name}
            </span>
            <span className="block break-words text-xs leading-relaxed text-paper/55">
              {item.sub}
            </span>
            {state.provider === item.key && (
              <span className="mt-2 block text-xs text-paper">เลือกแล้ว</span>
            )}
          </button>
        ))}
      </div>
      <label className={FIELD_LABEL} htmlFor="ob-apikey">
        API Key
      </label>
      <input
        id="ob-apikey"
        className={FIELD_INPUT}
        type="password"
        value={state.apiKey}
        onChange={(event) => onApiKeyChange(event.target.value)}
        placeholder={
          hasSavedApiKey
            ? "•••• บันทึกไว้แล้ว — พิมพ์ใหม่เพื่อเปลี่ยน"
            : state.provider === "gemini"
              ? "AIza..."
              : "sk-..."
        }
      />
      <div className="mt-4 flex items-center gap-4">
        <button type="button" className={BTN_GHOST} onClick={onBack}>
          ย้อนกลับ
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={onNext}>
          ถัดไป
        </button>
      </div>
    </>
  );
}

function MicrophoneStep({
  state,
  mics,
  status,
  error,
  canvasRef,
  onMicChange,
  onBack,
  onNext,
}: {
  state: OnboardingState;
  mics: MediaDeviceInfo[];
  status: string;
  error: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onMicChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <StepLabel step={3} />
      <h1 className="mb-4 text-[36px] font-semibold leading-[1.08] tracking-tight lg:text-[44px]">
        ให้เราฟังเสียง
        <br />
        <em className="not-italic font-semibold text-paper">คุณหน่อย</em>
      </h1>
      <p className="mb-6 max-w-[540px] text-[13.5px] leading-[1.7] text-paper/55">
        เลือกไมโครโฟน แล้วลองพูดดู แถบคลื่นเสียงด้านล่างจะขยับตามเสียงจริงของคุณ
      </p>
      <label className={FIELD_LABEL} htmlFor="ob-mic">
        ไมโครโฟน
      </label>
      <select
        id="ob-mic"
        className={FIELD_INPUT}
        value={state.micDeviceId}
        onChange={(event) => onMicChange(event.target.value)}
      >
        <option value="">ค่าเริ่มต้นของระบบ</option>
        {mics.map((mic, index) => (
          <option key={mic.deviceId} value={mic.deviceId}>
            {mic.label || `Microphone ${index + 1}`}
          </option>
        ))}
      </select>
      <div className="mb-5 mt-4 flex items-center gap-2 text-xs text-paper/55">
        <span
          className={`h-2 w-2 rounded-full ${error ? "bg-error" : status.startsWith("กำลัง") ? "bg-blue shadow-[0_0_0_4px_rgba(0,85,255,0.16)]" : "bg-paper/35"}`}
        />
        {error || status}
      </div>
      <div className="mb-5 flex h-[90px] items-center justify-center rounded-xl border border-paper/10 bg-ink-raised">
        <canvas
          ref={canvasRef}
          width="500"
          height="72"
          className="block max-w-full"
        />
      </div>
      <div className="flex items-center gap-4">
        <button type="button" className={BTN_GHOST} onClick={onBack}>
          ย้อนกลับ
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={onNext}>
          ถัดไป
        </button>
      </div>
    </>
  );
}

function HotkeyStep({
  hotkey,
  onHotkeyChange,
  onBack,
  onFinish,
  saving,
}: {
  hotkey: string;
  onHotkeyChange: (value: string) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const keys = hotkey
    .split("+")
    .map((key) => key.trim())
    .filter(Boolean);
  return (
    <>
      <StepLabel step={4} />
      <h1 className="mb-4 text-[36px] font-semibold leading-[1.08] tracking-tight lg:text-[44px]">
        จำ shortcut
        <br />
        นี้ไว้<em className="not-italic font-semibold text-paper">.</em>
      </h1>
      <p className="mb-6 max-w-[540px] text-[13.5px] leading-[1.7] text-paper/55">
        กดปุ่มนี้ที่ไหนก็ได้ในระบบเพื่อเริ่มพูด กดอีกครั้งเพื่อหยุดและส่งข้อความ
        เปลี่ยนได้ทีหลังในหน้า Settings
      </p>
      <div className="mb-6 flex flex-wrap gap-2.5">
        {keys.map((key) => (
          <span
            key={key}
            className="rounded-lg border-[1.5px] border-paper/10 bg-ink-raised px-4 py-3 text-[15px] font-bold shadow-[0_3px_0_rgba(245,239,230,0.1)]"
          >
            {key}
          </span>
        ))}
      </div>
      <label className={FIELD_LABEL} htmlFor="ob-hotkey">
        ปรับ Hotkey (ไม่บังคับ)
      </label>
      <input
        id="ob-hotkey"
        className={FIELD_INPUT}
        type="text"
        value={hotkey}
        placeholder="Control+Space"
        onChange={(event) => onHotkeyChange(event.target.value)}
      />
      <div className="mt-4 flex items-center gap-4">
        <button type="button" className={BTN_GHOST} onClick={onBack}>
          ย้อนกลับ
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={saving}
          onClick={onFinish}
        >
          {saving ? "กำลังบันทึก…" : "ถัดไป: ทดสอบ"}
        </button>
      </div>
    </>
  );
}

function TestStep({
  hotkey,
  onBack,
  onFinish,
  saving,
}: {
  hotkey: string;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <StepLabel step={TOTAL_STEPS} />
      <h1 className="mb-4 text-[36px] font-semibold leading-[1.08] tracking-tight lg:text-[44px]">
        ลองพูดดู<br />ว่าทำงานไหม
      </h1>
      <p id="ob-test-help" className="mb-6 max-w-[540px] text-[13.5px] leading-[1.7] text-paper/55">
        คลิกช่องด้านล่าง กด {hotkey} แล้วพูด เช่น “สวัสดี OpenPood”
        กดอีกครั้งเพื่อหยุด แล้วรอข้อความปรากฏในช่องนี้ โดยยังอยู่ที่หน้าเดิม
      </p>
      <label className={FIELD_LABEL} htmlFor="ob-test">
        ช่องทดสอบข้อความ
      </label>
      <input
        ref={inputRef}
        id="ob-test"
        className={FIELD_INPUT}
        type="text"
        aria-describedby="ob-test-help ob-test-note"
        placeholder="ข้อความที่พูดจะถูกวางที่นี่…"
        autoComplete="off"
        spellCheck={false}
      />
      <p id="ob-test-note" className="mt-3 text-xs leading-relaxed text-paper/55">
        ถ้าข้อความไม่มา ตรวจสอบ API Key และไมโครโฟนด้วยปุ่มย้อนกลับ
        การทดสอบใช้ API ที่คุณตั้งค่าไว้
      </p>
      <div className="mt-4 flex items-center gap-4">
        <button type="button" className={BTN_GHOST} disabled={saving} onClick={onBack}>
          ย้อนกลับ
        </button>
        <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={onFinish}>
          {saving ? "กำลังบันทึก…" : "เริ่มใช้งาน"}
        </button>
      </div>
    </>
  );
}

export function mountOnboarding(root: HTMLElement) {
  createRoot(root).render(<OnboardingPage />);
}
