import { icons } from "../icons";
import { BTN_PRIMARY, PAGE_TITLE, EMPTY_STATE } from "../uiClasses";

export async function mountDictionary(root: HTMLElement) {
  let words = await window.typeless.listDictionary();
  let corrections = await window.typeless.listCorrections();

  function render() {
    root.innerHTML = `
      <h1 class="${PAGE_TITLE} mb-2">Dictionary</h1>
      <p class="mb-5 text-[13px] text-neutral-400">คำในนี้เป็นแค่ใบ้ Whisper ให้โน้มเอียงมาใช้คำเหล่านี้ — ไม่การันตีว่าจะออกตรงทุกครั้ง ถ้ายังผิดซ้ำ ให้ใช้ Correction rules ด้านล่าง (ดู History ว่ามันถอดเป็นคำอะไรจริงๆ แล้วใส่คำนั้นในช่องซ้าย)</p>
      <div class="mb-4.5 flex gap-2">
        <label for="dict-input" class="sr-only">เพิ่มคำในพจนานุกรม</label>
        <input id="dict-input" type="text" placeholder="พิมพ์คำแล้วกด Enter" class="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors hover:border-neutral-400 focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-900/10" />
        <button id="add-btn" class="${BTN_PRIMARY} px-4">${icons.plus}<span>เพิ่ม</span></button>
      </div>
      <div class="flex flex-wrap gap-2" id="dict-chips">
        ${
          words.length === 0
            ? `<div class="${EMPTY_STATE}">ยังไม่มีคำในพจนานุกรม</div>`
            : words
                .map(
                  (w) =>
                    `<span class="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-1.5 pl-3.5 pr-1.5 text-[13px]">${escapeHtml(w)}<button data-word="${escapeHtml(w)}" aria-label="ลบคำ ${escapeHtml(w)}" class="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors [&_svg]:h-[11px] [&_svg]:w-[11px] hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20">${icons.x}</button></span>`,
                )
                .join("")
        }
      </div>

      <h2 class="mb-2 mt-7 text-[15px] font-bold">Correction rules</h2>
      <p class="mb-4.5 text-[13px] text-neutral-400">แทนที่ข้อความหลังถอดเสียงแบบตรงตัว (เช่น Whisper ออก "บอก" → เปลี่ยนเป็น "or") — ช่องซ้ายต้องเหมือนที่ขึ้นใน History เป๊ะ ไม่ใช่คำที่คุณตั้งใจพูด</p>
      <div class="mb-4.5 flex gap-2">
        <label for="corr-from-input" class="sr-only">คำที่มักถูกแปลงผิด</label>
        <input id="corr-from-input" type="text" placeholder="คำที่มักถูกแปลงผิด" class="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors hover:border-neutral-400 focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-900/10" />
        <span class="flex items-center text-neutral-300" aria-hidden="true">→</span>
        <label for="corr-to-input" class="sr-only">คำที่ต้องการให้ออกจริง</label>
        <input id="corr-to-input" type="text" placeholder="คำที่ต้องการให้ออกจริง" class="flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors hover:border-neutral-400 focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-900/10" />
        <button id="add-corr-btn" class="${BTN_PRIMARY} px-4">${icons.plus}<span>เพิ่ม</span></button>
      </div>
      <div class="flex flex-col gap-2" id="corr-list">
        ${
          corrections.length === 0
            ? `<div class="${EMPTY_STATE}">ยังไม่มี correction rule</div>`
            : corrections
                .map(
                  (c, i) => `
              <div class="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[13px]">
                <span class="min-w-0 flex-1 truncate">${escapeHtml(c.from)}</span>
                <span class="text-neutral-300" aria-hidden="true">→</span>
                <span class="min-w-0 flex-1 truncate font-medium">${escapeHtml(c.to)}</span>
                <button data-index="${i}" aria-label="ลบ correction rule ${escapeHtml(c.from)} ไป ${escapeHtml(c.to)}" class="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors [&_svg]:h-[11px] [&_svg]:w-[11px] hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20">${icons.x}</button>
              </div>
            `,
                )
                .join("")
        }
      </div>
    `;

    const input = document.getElementById("dict-input") as HTMLInputElement;
    const addBtn = document.getElementById("add-btn")!;

    async function addWord() {
      const value = input.value.trim();
      if (!value) return;
      words = await window.typeless.setDictionary([...words, value]);
      input.value = "";
      render();
    }

    addBtn.addEventListener("click", addWord);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addWord();
    });

    document
      .getElementById("dict-chips")!
      .addEventListener("click", async (e) => {
        const btn = (e.target as HTMLElement).closest(
          "button[data-word]",
        ) as HTMLButtonElement | null;
        if (!btn) return;
        words = await window.typeless.setDictionary(
          words.filter((w) => w !== btn.dataset.word),
        );
        render();
      });

    const fromInput = document.getElementById(
      "corr-from-input",
    ) as HTMLInputElement;
    const toInput = document.getElementById(
      "corr-to-input",
    ) as HTMLInputElement;
    const addCorrBtn = document.getElementById("add-corr-btn")!;

    async function addCorrection() {
      const from = fromInput.value.trim();
      const to = toInput.value.trim();
      if (!from || !to) return;
      corrections = await window.typeless.setCorrections([
        ...corrections,
        { from, to },
      ]);
      fromInput.value = "";
      toInput.value = "";
      render();
    }

    addCorrBtn.addEventListener("click", addCorrection);
    [fromInput, toInput].forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addCorrection();
      }),
    );

    document
      .getElementById("corr-list")!
      .addEventListener("click", async (e) => {
        const btn = (e.target as HTMLElement).closest(
          "button[data-index]",
        ) as HTMLButtonElement | null;
        if (!btn) return;
        const index = Number(btn.dataset.index);
        corrections = await window.typeless.setCorrections(
          corrections.filter((_, i) => i !== index),
        );
        render();
      });
  }

  render();
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
