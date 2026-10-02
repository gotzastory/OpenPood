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
    desc: "ความคิดที่ยุ่งเหยิง → งานเขียนที่ชัดเจน",
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
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">พูดไปเลย ไม่ต้องพิมพ์</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-base-content/65">
          ใช้ปุ่มลัดจากแอปไหนก็ได้ พูดให้จบ แล้ว OpenPud จะวางข้อความตรงตำแหน่งที่คุณกำลังพิมพ์
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="modes-title">
          <h2 id="modes-title" className="mb-3 text-sm font-semibold">โหมดพร้อมใช้</h2>
          <div className="list overflow-hidden rounded-xl border border-base-300 bg-base-100">
            {MODES.map((mode) => (
              <div key={mode.settingsKey} className="list-row items-center gap-3 border-b border-base-200 px-4 py-3.5 last:border-b-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-200 text-base-content/65 [&_svg]:h-[18px] [&_svg]:w-[18px]">
                  <Icon svg={mode.icon} />
                </div>
                <div className="list-col-grow min-w-0">
                  <h3 className="text-sm font-semibold">{mode.name}</h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-base-content/65">{mode.desc}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <HotkeyBadges hotkey={settings[mode.settingsKey]} />
                </div>
                <button
                  type="button"
                  aria-label={`ตั้งค่าคีย์ลัด ${mode.name}`}
                  title="ตั้งค่าคีย์ลัด"
                  className="btn btn-square btn-ghost btn-sm shrink-0 [&_svg]:h-4 [&_svg]:w-4"
                  onClick={() => setEditingMode(mode)}
                >
                  <Icon svg={icons.settings} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="card card-border bg-base-100" aria-labelledby="stats-title">
          <div className="card-body gap-4 p-4">
            <h2 id="stats-title" className="text-sm font-semibold">การใช้งานของคุณ</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
              <div><dt className="text-xs text-base-content/65">เวลาที่ใช้พูด</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.totalMinutes}<span className="ml-1 text-xs font-normal text-base-content/65">min</span></dd></div>
              <div><dt className="text-xs text-base-content/65">จำนวนคำ</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.totalWords}</dd></div>
              <div><dt className="text-xs text-base-content/65">ความเร็ว</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.wpm}<span className="ml-1 text-xs font-normal text-base-content/65">WPM</span></dd></div>
              <div><dt className="text-xs text-base-content/65">ครั้งที่ใช้งาน</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.sessions}</dd></div>
            </dl>
            <div className="flex items-start gap-2 border-t border-base-200 pt-3 text-xs leading-relaxed text-base-content/65 [&_svg]:mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5" aria-label="ข้อมูลความเป็นส่วนตัว">
              <Icon svg={icons.lock} />
              <span>เสียงถูกส่งไปยัง API ที่คุณเลือกเพื่อถอดข้อความเท่านั้น</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-8" aria-labelledby="use-cases-title">
        <h2 id="use-cases-title" className="mb-3 text-sm font-semibold">ใช้ได้ทุกที่ที่พิมพ์ข้อความ</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {USE_CASES.map((useCase) => (
            <article key={useCase.name} className="card card-border min-w-0 bg-base-100">
              <div className="card-body gap-1.5 p-4">
                <img src={useCase.logo} alt="" width="32" height="32" className="mb-1 h-8 w-8 object-contain" />
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
