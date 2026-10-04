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
    return <div className="mx-auto max-w-[1120px] text-sm text-base-content/65">กำลังโหลด...</div>;
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <header className="mb-7">
        <h1 className="text-[36px] font-semibold tracking-tight">พูดไปเลย ไม่ต้องพิมพ์</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          กดปุ่มลัดเพื่อเริ่มพูด กดอีกครั้งเพื่อจบ แล้ว OpenPood จะวางข้อความให้ตรง cursor
        </p>
      </header>

      <div className="space-y-7">
        <section aria-labelledby="modes-title">
          <h2 id="modes-title" className="mb-3 text-sm font-semibold">เริ่มด้วยปุ่มลัดของคุณ</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {MODES.map((mode) => (
              <div key={mode.settingsKey} className={`card rounded-xl border ${mode.settingsKey === "hotkey" ? "border-primary bg-primary bg-linear-to-br from-primary from-35% to-neutral text-primary-content" : "border-base-300 bg-base-100 text-base-content"}`}>
                <div className="card-body gap-0 p-6">
                <div className="mb-5 flex items-center justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg [&_svg]:h-6 [&_svg]:w-6 ${mode.settingsKey === "hotkey" ? "bg-primary-content/15" : "bg-base-200 text-primary"}`}>
                  <Icon svg={mode.icon} />
                </div>
                <button type="button" onClick={() => setEditingMode(mode)}
                  className={`btn btn-ghost btn-sm ${mode.settingsKey === "hotkey" ? "text-primary-content hover:bg-primary-content/15" : "text-secondary"}`}
                  aria-label={`ตั้งค่าคีย์ลัด ${mode.name}`}>
                  <Icon svg={icons.settings} /><span>เปลี่ยนปุ่มลัด</span>
                </button>
                </div>
                <h3 className="text-2xl font-semibold">{mode.name}</h3>
                <p className={`mt-2 min-h-10 text-sm leading-relaxed ${mode.settingsKey === "hotkey" ? "text-primary-content" : "text-secondary"}`}>{mode.desc}</p>
                <div className={`mt-6 flex flex-wrap gap-2 ${mode.settingsKey === "hotkey" ? "[&_kbd]:border-primary-content/30 [&_kbd]:bg-primary-content/15 [&_kbd]:text-primary-content [&_kbd]:shadow-none" : ""}`}>
                  <HotkeyBadges hotkey={settings[mode.settingsKey]} />
                </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="border-y border-base-300 py-5" aria-labelledby="stats-title">
          <div className="space-y-4">
            <h2 id="stats-title" className="text-sm font-semibold">การใช้งานของคุณ</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <div><dt className="text-xs text-base-content/65">เวลาที่ใช้พูด</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.totalMinutes}<span className="ml-1 text-xs font-normal text-base-content/65">min</span></dd></div>
              <div><dt className="text-xs text-base-content/65">จำนวนคำ</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.totalWords}</dd></div>
              <div><dt className="text-xs text-base-content/65">ความเร็ว</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.wpm}<span className="ml-1 text-xs font-normal text-base-content/65">WPM</span></dd></div>
              <div><dt className="text-xs text-base-content/65">ครั้งที่ใช้งาน</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.sessions}</dd></div>
            </dl>
            <div className="flex items-start gap-2 border-t border-base-200 pt-3 text-xs leading-relaxed text-base-content/65 [&_svg]:mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5" aria-label="ข้อมูลความเป็นส่วนตัว">
              <Icon svg={icons.lock} />
              <span>เสียงส่งไปยังผู้ให้บริการที่คุณเลือก และข้อความอาจส่งเพื่อปรับหรือแปลตามการตั้งค่า ประวัติเก็บในเครื่อง</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-8" aria-labelledby="use-cases-title">
        <h2 id="use-cases-title" className="mb-3 text-sm font-semibold">ใช้ได้ทุกที่ที่พิมพ์ข้อความ</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-3">
          {USE_CASES.map((useCase) => (
            <article key={useCase.name} className="flex min-w-0 items-start gap-3">
                <img src={useCase.logo} alt="" width="24" height="24" loading="lazy" className="mt-0.5 h-6 w-6 shrink-0 object-contain" />
              <div>
                <h3 className="text-sm font-semibold">{useCase.name}</h3>
                <p className="text-[13px] leading-relaxed text-base-content/65">{useCase.desc}</p>
              </div>
            </article>
          ))}
        </div>
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
