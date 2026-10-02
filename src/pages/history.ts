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
      <div class="mx-auto max-w-[920px]">
        <header class="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 class="${PAGE_TITLE}">History</h1>
            <p class="mt-1 text-sm text-base-content/65">ย้อนดูและคัดลอกข้อความที่ถอดเสียงไว้ในเครื่องนี้</p>
          </div>
          <button id="clear-btn" class="${BTN}" ${entries.length === 0 ? "disabled" : ""}>${icons.trash}<span>ล้างประวัติ</span></button>
        </header>
        <div id="history-status" class="sr-only" aria-live="polite"></div>
        <div class="flex flex-col gap-2.5">
        ${
          entries.length === 0
            ? `<div class="${EMPTY_STATE}">ยังไม่มีประวัติการอัดเสียง</div>`
            : entries
                .map(
                  (e) => `
              <article class="card card-border bg-base-100">
                <div class="card-body gap-2 p-4">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/65">
                  <span>${new Date(e.timestamp).toLocaleString("th-TH")}</span>
                  <span>${e.wordCount} คำ</span>
                  <span>${(e.durationMs / 1000).toFixed(1)}s</span>
                  <button class="copy-btn ${BTN} ml-auto" data-id="${e.id}">${icons.copy}<span>คัดลอก</span></button>
                </div>
                <p class="whitespace-pre-wrap break-words text-sm leading-6">${escapeHtml(e.text) || "<i>(ว่าง)</i>"}</p>
                </div>
              </article>
            `,
                )
                .join("")
        }
        </div>
      </div>
    `;

    document
      .getElementById("clear-btn")
      ?.addEventListener("click", async () => {
        if (!confirm("ลบประวัติการอัดเสียงทั้งหมด? ทำย้อนกลับไม่ได้")) return;
        try {
          await window.typeless.clearHistory();
          await render();
        } catch (err) {
          console.error(err);
          const status = document.getElementById("history-status");
          if (status) status.textContent = "ล้างประวัติไม่สำเร็จ กรุณาลองอีกครั้ง";
        }
      });

    root.querySelectorAll<HTMLButtonElement>(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const entry = entries.find((e) => e.id === btn.dataset.id);
        if (!entry) return;
        const status = document.getElementById("history-status");
        try {
          await navigator.clipboard.writeText(entry.text);
          btn.innerHTML = `${icons.check}<span>คัดลอกแล้ว</span>`;
          if (status) status.textContent = "คัดลอกข้อความแล้ว";
          setTimeout(() => {
            btn.innerHTML = `${icons.copy}<span>คัดลอก</span>`;
          }, 1200);
        } catch (err) {
          console.error(err);
          if (status) status.textContent = "คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง";
        }
      });
    });
  }

  unsubscribeHistoryUpdates?.();
  unsubscribeHistoryUpdates = window.typeless.onHistoryUpdated(render);
  await render();
}
