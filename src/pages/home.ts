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
    logo: "./icons/gmail-2026.svg",
  },
  {
    name: "Slack",
    desc: "อัปเดตทีมด้วยข้อความที่ชัดเจนโดยไม่สะดุดความคิด",
    logo: "./icons/slack.svg",
  },
  {
    name: "ChatGPT",
    desc: "พูด prompt แล้วได้คำตอบที่ดีกว่าเร็วกว่า",
    logo: "./icons/openai-chatgpt.svg",
  },
  {
    name: "Google Docs",
    desc: "แปลงความคิดที่พูดเป็นงานเขียนที่มีโครงสร้าง",
    logo: "./icons/google-docs-2026.svg",
  },
  {
    name: "WhatsApp",
    desc: "แปลงข้อความสั้นๆ ให้เป็นข้อความที่เป็นธรรมชาติ",
    logo: "./icons/whatsapp.svg",
  },
  {
    name: "Claude",
    desc: "ระดมความคิดและขัดเกลาไอเดียโดยไม่ต้องพิมพ์",
    logo: "./icons/claude.svg",
  },
];

type HotkeySettingsKey = "hotkey" | "translateHotkey";

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

export async function mountHome(root: HTMLElement) {
  const settings = await window.typeless.getSettings();
  const stats = await window.typeless.historyStats();

  root.innerHTML = `
    <div class="mx-auto max-w-[1120px]">
      <header class="mb-7">
        <h1 class="text-[32px] font-bold tracking-[-0.025em]">พูดไปเลย ไม่ต้องพิมพ์</h1>
        <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-base-content/65">ใช้ปุ่มลัดจากแอปไหนก็ได้ พูดให้จบ แล้ว OpenPud จะวางข้อความตรงตำแหน่งที่คุณกำลังพิมพ์</p>
      </header>

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="modes-title">
          <h2 id="modes-title" class="mb-3 text-sm font-semibold">โหมดพร้อมใช้</h2>
          <div class="list overflow-hidden rounded-xl border border-base-300 bg-base-100">
          ${MODES.map(
            (m) => `
            <div class="list-row items-center gap-3 border-b border-base-200 px-4 py-3.5 last:border-b-0">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-200 text-base-content/65 [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden="true">${m.icon}</div>
              <div class="list-col-grow min-w-0">
                <h3 class="text-sm font-semibold">${m.name}</h3>
                <p class="mt-0.5 text-[13px] leading-relaxed text-base-content/65">${m.desc}</p>
              </div>
              <div id="hotkey-badges-${m.settingsKey}" class="flex shrink-0 gap-1.5">${renderHotkeyBadges(settings[m.settingsKey])}</div>
              <button type="button" data-configure-key="${m.settingsKey}" data-configure-name="${m.name}" aria-label="ตั้งค่าคีย์ลัด ${m.name}" title="ตั้งค่าคีย์ลัด" class="btn btn-square btn-ghost btn-sm shrink-0 [&_svg]:h-4 [&_svg]:w-4">${icons.settings}</button>
            </div>
          `,
          ).join("")}
          </div>
        </section>

        <aside class="card card-border bg-base-100" aria-labelledby="stats-title">
          <div class="card-body gap-4 p-4">
            <h2 id="stats-title" class="text-sm font-semibold">การใช้งานของคุณ</h2>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-5">
              <div><dt class="text-xs text-base-content/65">เวลาที่ใช้พูด</dt><dd class="mt-1 text-xl font-semibold tabular-nums">${stats.totalMinutes}<span class="ml-1 text-xs font-normal text-base-content/65">min</span></dd></div>
              <div><dt class="text-xs text-base-content/65">จำนวนคำ</dt><dd class="mt-1 text-xl font-semibold tabular-nums">${stats.totalWords}</dd></div>
              <div><dt class="text-xs text-base-content/65">ความเร็ว</dt><dd class="mt-1 text-xl font-semibold tabular-nums">${stats.wpm}<span class="ml-1 text-xs font-normal text-base-content/65">WPM</span></dd></div>
              <div><dt class="text-xs text-base-content/65">ครั้งที่ใช้งาน</dt><dd class="mt-1 text-xl font-semibold tabular-nums">${stats.sessions}</dd></div>
            </dl>
            <div class="flex items-start gap-2 border-t border-base-200 pt-3 text-xs leading-relaxed text-base-content/65 [&_svg]:mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5" aria-label="ข้อมูลความเป็นส่วนตัว">${icons.lock}<span>เสียงถูกส่งไปยัง API ที่คุณเลือกเพื่อถอดข้อความเท่านั้น</span></div>
          </div>
        </aside>
      </div>

      <section class="mt-8" aria-labelledby="use-cases-title">
        <h2 id="use-cases-title" class="mb-3 text-sm font-semibold">ใช้ได้ทุกที่ที่พิมพ์ข้อความ</h2>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
          ${USE_CASES.map(
            (u) => `
            <article class="card card-border min-w-0 bg-base-100">
              <div class="card-body gap-1.5 p-4">
                <img src="${u.logo}" alt="" width="32" height="32" class="mb-1 h-8 w-8 object-contain" />
                <h3 class="text-sm font-semibold">${u.name}</h3>
                <p class="text-[13px] leading-relaxed text-base-content/65">${u.desc}</p>
              </div>
            </article>
          `,
          ).join("")}
        </div>
      </section>
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

  const overlay = document.createElement("dialog");
  overlay.className = "modal";
  overlay.innerHTML = `
    <div class="modal-box w-[min(380px,calc(100vw-2rem))] p-5" aria-labelledby="hotkey-modal-title" aria-describedby="hotkey-modal-help">
      <h3 id="hotkey-modal-title" class="text-base font-semibold">คีย์ลัด ${modeName}</h3>
      <p id="hotkey-modal-help" class="mt-1 text-[13px] leading-relaxed text-base-content/65">กด “เปลี่ยน” แล้วกดคีย์ลัดชุดใหม่ จากนั้นบันทึก</p>
      <div id="modal-hotkey-badges" class="mt-4 flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-base-300 bg-base-200 px-3 py-3">${renderHotkeyBadges(value)}</div>
      <div class="modal-action mt-5">
        <button id="modal-cancel-btn" type="button" class="${BTN}">ยกเลิก</button>
        <button id="modal-record-btn" type="button" class="${BTN}">เปลี่ยน</button>
        <button id="modal-save-btn" type="button" class="${BTN_PRIMARY}">บันทึก</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.showModal();

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
  recordBtn.focus();

  function close() {
    document.removeEventListener("keydown", onModalKeydown, true);
    if (overlay.open) overlay.close();
  }

  function onModalKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onModalKeydown, true);

  overlay.addEventListener("close", () => overlay.remove(), { once: true });
  cancelBtn.addEventListener("click", close);

  recordBtn.addEventListener("click", () => {
    document.removeEventListener("keydown", onModalKeydown, true);
    recordBtn.disabled = true;
    recordBtn.textContent = "รอ...";
    badgesEl.innerHTML = `<span class="text-xs text-base-content/65">กดปุ่มที่ต้องการ (Esc ยกเลิก)</span>`;

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
    } catch (err) {
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.textContent = "บันทึกไม่สำเร็จ — ลองใหม่";
    }
  });
}
