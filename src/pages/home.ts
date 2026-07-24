import { icons } from "../icons";
import { renderHotkeyBadges, acceleratorFromEvent } from "../hotkey";
import { BTN, BTN_PRIMARY } from "../uiClasses";
import type { AppSettings } from "../types";

interface UseCase {
  name: string;
  desc: string;
  logo: string;
}

const USE_CASES: UseCase[] = [
  {
    name: "Gmail",
    desc: "พูดความคิด แล้วได้อีเมลที่เรียบร้อยพร้อมส่ง",
    logo: "/icons/gmail-2026.svg",
  },
  {
    name: "Slack",
    desc: "อัปเดตทีมด้วยข้อความที่ชัดเจนโดยไม่สะดุดความคิด",
    logo: "/icons/slack.svg",
  },
  {
    name: "ChatGPT",
    desc: "พูด prompt แล้วได้คำตอบที่ดีกว่าเร็วกว่า",
    logo: "/icons/openai-chatgpt.svg",
  },
  {
    name: "Google Docs",
    desc: "แปลงความคิดที่พูดเป็นงานเขียนที่มีโครงสร้าง",
    logo: "/icons/google-docs-2026.svg",
  },
  {
    name: "WhatsApp",
    desc: "แปลงข้อความสั้นๆ ให้เป็นข้อความที่เป็นธรรมชาติ",
    logo: "/icons/whatsapp.svg",
  },
  {
    name: "Claude",
    desc: "ระดมความคิดและขัดเกลาไอเดียโดยไม่ต้องพิมพ์",
    logo: "/icons/claude.svg",
  },
];

type HotkeySettingsKey = "hotkey" | "translateHotkey" | "askHotkey";

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
  {
    name: "Ask anything",
    desc: "เลือกข้อความในแอปไหนก็ได้ แล้วพูดสั่งแก้ไขหรือถามได้เลย",
    icon: icons.messageQuestion,
    settingsKey: "askHotkey",
  },
];

export async function mountHome(root: HTMLElement) {
  const settings = await window.typeless.getSettings();
  const stats = await window.typeless.historyStats();

  root.innerHTML = `
    <div class="flex items-start gap-8">
      <div class="min-w-0 flex-1">
        <h1 class="mb-6 text-[38px] font-extrabold tracking-tight">พูดไปเลย, ไม่ต้องพิม</h1>

        <div class="mb-7 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          ${MODES.map(
            (m) => `
            <div class="relative flex items-center gap-3.5 border-b border-neutral-100 px-5 py-4 last:border-b-0">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-600 [&_svg]:h-[18px] [&_svg]:w-[18px]">${m.icon}</div>
              <div class="min-w-0 flex-1">
                <h3 class="text-[15px] font-medium">${m.name}</h3>
                <p class="text-[13px] text-neutral-400">${m.desc}</p>
              </div>
              <div id="hotkey-badges-${m.settingsKey}" class="flex shrink-0 gap-1.5">${renderHotkeyBadges(settings[m.settingsKey])}</div>
              <button type="button" data-configure-key="${m.settingsKey}" data-configure-name="${m.name}" aria-label="ตั้งค่าคีย์ลัด ${m.name}" title="ตั้งค่าคีย์ลัด" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 [&_svg]:h-4 [&_svg]:w-4">${icons.settings}</button>
            </div>
          `,
          ).join("")}
        </div>

        <h2 class="mb-3.5 text-[15px] font-bold">Popular use cases</h2>
        <div class="grid grid-cols-3 gap-3.5">
          ${USE_CASES.map(
            (u) => `
            <div class="rounded-xl border border-neutral-200 bg-white p-4">
              <img src="${u.logo}" alt="${u.name}" class="mb-2.5 h-8 w-8" />
              <h4 class="mb-1 text-sm font-medium">${u.name}</h4>
              <p class="text-[12.5px] leading-snug text-neutral-400">${u.desc}</p>
            </div>
          `,
          ).join("")}
        </div>
      </div>

      <div class="flex w-64 shrink-0 flex-col gap-4">
        <div class="rounded-xl border border-neutral-200 bg-white p-4">
          <div class="flex items-center gap-2.5 py-1.5 text-[13.5px] text-neutral-600 [&_svg]:text-neutral-400">${icons.clock}<span>เวลาที่ใช้พูด</span><b class="ml-auto text-neutral-900">${stats.totalMinutes} min</b></div>
          <div class="flex items-center gap-2.5 py-1.5 text-[13.5px] text-neutral-600 [&_svg]:text-neutral-400">${icons.mic}<span>จำนวนคำ</span><b class="ml-auto text-neutral-900">${stats.totalWords}</b></div>
          <div class="flex items-center gap-2.5 py-1.5 text-[13.5px] text-neutral-600 [&_svg]:text-neutral-400">${icons.zap}<span>ความเร็ว</span><b class="ml-auto text-neutral-900">${stats.wpm} WPM</b></div>
          <div class="flex items-center gap-2.5 py-1.5 text-[13.5px] text-neutral-600 [&_svg]:text-neutral-400">${icons.folder}<span>ครั้งที่ใช้งาน</span><b class="ml-auto text-neutral-900">${stats.sessions}</b></div>
          <div class="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-neutral-400 [&_svg]:mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5">${icons.lock}<span>เสียงจะถูกส่งไปยัง API แปลงข้อความเท่านั้น ไม่ถูกเก็บไว้ในเครื่องหรือระบบของแอปนี้</span></div>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>("[data-configure-key]").forEach((btn) => {
    const key = btn.dataset.configureKey as HotkeySettingsKey;
    const name = btn.dataset.configureName!;
    btn.addEventListener("click", () => {
      openHotkeyModal(name, settings[key], async (newHotkey) => {
        await window.typeless.setSettings({ [key]: newHotkey } as Partial<AppSettings>);
        settings[key] = newHotkey;
        const badges = document.getElementById(`hotkey-badges-${key}`);
        if (badges) badges.innerHTML = renderHotkeyBadges(newHotkey);
      });
    });
  });
}

function openHotkeyModal(
  modeName: string,
  currentHotkey: string,
  onSaved: (hotkey: string) => void | Promise<void>,
) {
  let value = currentHotkey;

  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-50 flex items-center justify-center bg-black/30";
  overlay.innerHTML = `
    <div class="w-[380px] rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="ตั้งค่าคีย์ลัด ${modeName}">
      <h3 class="mb-1 text-[15px] font-bold">คีย์ลัด ${modeName}</h3>
      <p class="mb-4 text-[13px] text-neutral-400">กดปุ่มที่ต้องการตั้งเป็นคีย์ลัดสำหรับเริ่ม/หยุดอัดเสียง</p>
      <div id="modal-hotkey-badges" class="mb-4 flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-3">${renderHotkeyBadges(value)}</div>
      <div class="flex justify-end gap-2">
        <button id="modal-cancel-btn" type="button" class="${BTN}">ยกเลิก</button>
        <button id="modal-record-btn" type="button" class="${BTN}">เปลี่ยน</button>
        <button id="modal-save-btn" type="button" class="${BTN_PRIMARY}">บันทึก</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const badgesEl = overlay.querySelector("#modal-hotkey-badges")!;
  const recordBtn = overlay.querySelector(
    "#modal-record-btn",
  ) as HTMLButtonElement;
  const saveBtn = overlay.querySelector(
    "#modal-save-btn",
  ) as HTMLButtonElement;
  const cancelBtn = overlay.querySelector(
    "#modal-cancel-btn",
  ) as HTMLButtonElement;

  function close() {
    document.removeEventListener("keydown", onModalKeydown, true);
    overlay.remove();
  }

  function onModalKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onModalKeydown, true);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  cancelBtn.addEventListener("click", close);

  recordBtn.addEventListener("click", () => {
    document.removeEventListener("keydown", onModalKeydown, true);
    recordBtn.disabled = true;
    recordBtn.textContent = "รอ...";
    badgesEl.innerHTML = `<span class="text-xs text-neutral-400">กดปุ่มที่ต้องการ (Esc ยกเลิก)</span>`;

    const onRecordKeydown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        finishRecording(value);
        return;
      }
      const accelerator = acceleratorFromEvent(e);
      if (!accelerator || !accelerator.includes("+")) return;
      finishRecording(accelerator);
    };

    function finishRecording(accelerator: string) {
      document.removeEventListener("keydown", onRecordKeydown, true);
      value = accelerator;
      badgesEl.innerHTML = renderHotkeyBadges(accelerator);
      recordBtn.disabled = false;
      recordBtn.textContent = "เปลี่ยน";
      document.addEventListener("keydown", onModalKeydown, true);
    }

    document.addEventListener("keydown", onRecordKeydown, true);
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "กำลังบันทึก…";
    try {
      await onSaved(value);
      close();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = "บันทึก";
    }
  });
}
