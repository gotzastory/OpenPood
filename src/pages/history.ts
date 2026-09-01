import { icons } from "../icons";
import { BTN, PAGE_TITLE, EMPTY_STATE } from "../uiClasses";
import { escapeHtml } from "../escape";

// Module-level so remounting the page replaces the previous subscription
// instead of stacking one listener per navigation to /history.
let unsubscribeHistoryUpdates: (() => void) | null = null;

export async function mountHistory(root: HTMLElement) {
  async function render() {
    const entries = await window.typeless.listHistory();
    root.innerHTML = `
      <div class="mb-5 flex items-center justify-between">
        <h1 class="${PAGE_TITLE}">History</h1>
        <button id="clear-btn" class="${BTN}">${icons.trash}<span>ล้างประวัติ</span></button>
      </div>
      <div class="flex flex-col gap-2.5">
        ${
          entries.length === 0
            ? `<div class="${EMPTY_STATE}">ยังไม่มีประวัติการอัดเสียง</div>`
            : entries
                .map(
                  (e) => `
              <div class="rounded-xl border border-neutral-200 bg-white px-4.5 py-3.5">
                <div class="mb-1.5 flex items-center gap-3 text-xs text-neutral-400">
                  <span>${new Date(e.timestamp).toLocaleString("th-TH")}</span>
                  <span>${e.wordCount} คำ</span>
                  <span>${(e.durationMs / 1000).toFixed(1)}s</span>
                  <button class="copy-btn ${BTN} ml-auto px-2.5 py-1" data-id="${e.id}">${icons.copy}<span>คัดลอก</span></button>
                </div>
                <div class="text-sm leading-relaxed">${escapeHtml(e.text) || "<i>(ว่าง)</i>"}</div>
              </div>
            `,
                )
                .join("")
        }
      </div>
    `;

    document
      .getElementById("clear-btn")
      ?.addEventListener("click", async () => {
        if (!confirm("ลบประวัติการอัดเสียงทั้งหมด? ทำย้อนกลับไม่ได้")) return;
        await window.typeless.clearHistory();
        render();
      });

    root.querySelectorAll<HTMLButtonElement>(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const entry = entries.find((e) => e.id === btn.dataset.id);
        if (!entry) return;
        await navigator.clipboard.writeText(entry.text);
        btn.innerHTML = `${icons.check}<span>คัดลอกแล้ว</span>`;
        setTimeout(() => {
          btn.innerHTML = `${icons.copy}<span>คัดลอก</span>`;
        }, 1200);
      });
    });
  }

  unsubscribeHistoryUpdates?.();
  unsubscribeHistoryUpdates = window.typeless.onHistoryUpdated(render);
  await render();
}
