import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { icons } from "../lib/icons";
import type { AppSettings, HistoryStats } from "../types";
import { HotkeyBadges, HotkeyModal } from "../components/HotkeyModal";

interface UseCase {
  name: string;
  desc: string;
  logo: string;
}

type HotkeySettingsKey = "hotkey" | "translateHotkey";

const USE_CASES: UseCase[] = [
  { name: "Gmail", desc: "พูดความคิด แล้วได้อีเมลที่เรียบร้อยพร้อมส่ง", logo: "./icons/gmail-2026.svg" },
  { name: "Slack", desc: "อัปเดตทีมด้วยข้อความที่ชัดเจนโดยไม่สะดุดความคิด", logo: "./icons/slack.svg" },
  { name: "ChatGPT", desc: "พูด prompt แล้วได้คำตอบที่ดีกว่าเร็วกว่า", logo: "./icons/openai-chatgpt.svg" },
  { name: "Google Docs", desc: "แปลงความคิดที่พูดเป็นงานเขียนที่มีโครงสร้าง", logo: "./icons/google-docs-2026.svg" },
  { name: "WhatsApp", desc: "แปลงข้อความสั้นๆ ให้เป็นข้อความที่เป็นธรรมชาติ", logo: "./icons/whatsapp.svg" },
  { name: "Claude", desc: "ระดมความคิดและขัดเกลาไอเดียโดยไม่ต้องพิมพ์", logo: "./icons/claude.svg" },
];

const MODES: {
  name: string;
  desc: string;
  icon: string;
  settingsKey: HotkeySettingsKey;
}[] = [
  {
    name: "Dictate",
    desc: "พูดไทยหรืออังกฤษ แล้ววางข้อความตรง cursor",
    icon: icons.mic,
    settingsKey: "hotkey",
  },
  {
    name: "Translate",
    desc: "พูดภาษาไหนก็ได้ → แปลเป็นภาษาที่ตั้งไว้ใน Settings อัตโนมัติ",
    icon: icons.languages,
    settingsKey: "translateHotkey",
  },
];

export function HomePage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingMode, setEditingMode] = useState<(typeof MODES)[number] | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.typeless.onHistoryUpdated(() => {
      void window.typeless.historyStats().then((nextStats) => {
        if (active) setStats(nextStats);
      }).catch(() => { if (active) setLoadError(true); });
    });
    void Promise.all([
      window.typeless.getSettings(),
      window.typeless.historyStats(),
    ])
      .then(([nextSettings, nextStats]) => {
        if (!active) return;
        setSettings(nextSettings);
        setStats(nextStats);
      })
      .catch((err: unknown) => {
        console.error(err);
        if (active) setLoadError(true);
      });
    document.getElementById("content")?.focus({ preventScroll: true });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const saveHotkey = async (key: HotkeySettingsKey, hotkey: string) => {
    const nextSettings = await window.typeless.setSettings({ [key]: hotkey });
    setSettings(nextSettings);
  };

  if (loadError) {
    return (
      <div role="alert" className="alert alert-error alert-soft mx-auto max-w-xl text-sm">
        โหลดหน้า Home ไม่สำเร็จ กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง
      </div>
    );
  }

  if (!settings || !stats) {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary" role="status">
        <span className="loading loading-spinner loading-sm" aria-hidden="true" />
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">หน้าหลัก</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
          กดปุ่มลัดเพื่อเริ่มพูด กดอีกครั้งเพื่อจบ แล้ว OpenPood จะวางข้อความให้ตรง cursor
        </p>
      </header>

      <section aria-labelledby="modes-title">
        <h2 id="modes-title" className="mb-2 text-sm font-semibold">ปุ่มลัด</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {MODES.map((mode) => {
            const primary = mode.settingsKey === "hotkey";
            return (
              <div key={mode.settingsKey} className={`card card-border bg-base-100 ${primary ? "border-primary" : ""}`}>
                <div className="card-body gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-base-200 [&_svg]:h-5 [&_svg]:w-5 ${primary ? "text-primary" : "text-secondary"}`}>
                        <Icon svg={mode.icon} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold">{mode.name}</h3>
                        <p className="text-sm leading-relaxed text-secondary">{mode.desc}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingMode(mode)}
                      className="btn btn-ghost btn-sm shrink-0"
                      aria-label={`ตั้งค่าคีย์ลัด ${mode.name}`}
                    >
                      <Icon svg={icons.settings} />
                      <span>เปลี่ยน</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <HotkeyBadges hotkey={settings[mode.settingsKey]} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5" aria-labelledby="stats-title">
        <h2 id="stats-title" className="mb-2 text-sm font-semibold">การใช้งานของคุณ</h2>
        <div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-none sm:stats-horizontal">
          <div className="stat py-3">
            <div className="stat-title">เวลาที่ใช้พูด</div>
            <div className="stat-value text-2xl tabular-nums">{stats.totalMinutes}</div>
            <div className="stat-desc">นาที</div>
          </div>
          <div className="stat py-3">
            <div className="stat-title">จำนวนคำ</div>
            <div className="stat-value text-2xl tabular-nums">{stats.totalWords}</div>
          </div>
          <div className="stat py-3">
            <div className="stat-title">ความเร็ว</div>
            <div className="stat-value text-2xl tabular-nums">{stats.wpm}</div>
            <div className="stat-desc">คำต่อนาที</div>
          </div>
          <div className="stat py-3">
            <div className="stat-title">ครั้งที่ใช้งาน</div>
            <div className="stat-value text-2xl tabular-nums">{stats.sessions}</div>
          </div>
        </div>
      </section>

      <div className="alert alert-soft mt-4 text-sm" aria-label="ข้อมูลความเป็นส่วนตัว">
        <Icon svg={icons.lock} />
        <span>เสียงส่งไปยังผู้ให้บริการที่คุณเลือก และข้อความอาจส่งเพื่อปรับหรือแปลตามการตั้งค่า ประวัติถูกเข้ารหัสเก็บในเครื่อง</span>
      </div>

      <section className="mt-5" aria-labelledby="use-cases-title">
        <h2 id="use-cases-title" className="mb-2 text-sm font-semibold">ใช้ได้ทุกที่ที่พิมพ์ข้อความ</h2>
        <ul className="list rounded-box border border-base-300 bg-base-100">
          {USE_CASES.map((useCase) => (
            <li key={useCase.name} className="list-row items-center gap-3 px-3 py-2">
              <img src={useCase.logo} alt="" width="24" height="24" loading="lazy" className="h-6 w-6 shrink-0 object-contain" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{useCase.name}</h3>
                <p className="text-sm leading-relaxed text-secondary">{useCase.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editingMode && (
        <HotkeyModal
          modeName={editingMode.name}
          currentHotkey={settings[editingMode.settingsKey]}
          onClose={() => setEditingMode(null)}
          onSave={(hotkey) => saveHotkey(editingMode.settingsKey, hotkey)}
        />
      )}
    </div>
  );
}
