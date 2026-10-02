import { icons } from "../icons";
import { PAGE_TITLE } from "../uiClasses";
import { escapeHtml } from "../escape";

export async function mountDictionary(root: HTMLElement) {
  let words: string[] = [];
  let corrections: Awaited<ReturnType<typeof window.typeless.listCorrections>> = [];
  let loadError: unknown;

  try {
    [words, corrections] = await Promise.all([
      window.typeless.listDictionary(),
      window.typeless.listCorrections(),
    ]);
  } catch (err) {
    loadError = err;
  }

  function showError(err: unknown) {
    const alert = document.getElementById("dictionary-error");
    if (!alert) return;
    alert.textContent = err instanceof Error ? err.message : String(err);
    alert.classList.remove("hidden");
  }

  function render() {
    root.innerHTML = `
      <h1 class="${PAGE_TITLE} mb-2">Dictionary</h1>
      <p class="mb-5 text-[13px] text-base-content/55">คำในนี้เป็นแค่ใบ้ Whisper ให้โน้มเอียงมาใช้คำเหล่านี้ — ไม่การันตีว่าจะออกตรงทุกครั้ง ถ้ายังผิดซ้ำ ให้ใช้ Correction rules ด้านล่าง (ดู History ว่ามันถอดเป็นคำอะไรจริงๆ แล้วใส่คำนั้นในช่องซ้าย)</p>
      <div id="dictionary-error" role="alert" class="alert alert-error alert-soft mb-4 hidden text-sm"></div>
      <div class="mb-4.5 flex gap-2">
        <label for="dict-input" class="sr-only">เพิ่มคำในพจนานุกรม</label>
        <input id="dict-input" type="text" placeholder="พิมพ์คำแล้วกด Enter" class="input input-sm min-w-0 flex-1" />
        <button id="add-btn" class="btn btn-neutral btn-sm">${icons.plus}<span>เพิ่ม</span></button>
      </div>
      <div class="flex flex-wrap gap-2" id="dict-chips">
        ${
          words.length === 0
            ? `<div class="w-full py-10 text-center text-sm text-base-content/40">ยังไม่มีคำในพจนานุกรม</div>`
            : words
                .map(
                  (w) =>
                    `<span class="badge badge-outline badge-lg h-auto gap-1.5 py-1 pl-3 pr-1 text-[13px]">${escapeHtml(w)}<button data-word="${escapeHtml(w)}" aria-label="ลบคำ ${escapeHtml(w)}" class="btn btn-circle btn-ghost btn-xs [&_svg]:h-[11px] [&_svg]:w-[11px]">${icons.x}</button></span>`,
                )
                .join("")
        }
      </div>

      <h2 class="mb-2 mt-7 text-[15px] font-bold">Correction rules</h2>
      <p class="mb-4.5 text-[13px] text-base-content/55">แทนที่ข้อความหลังถอดเสียงแบบตรงตัว (เช่น Whisper ออก "บอก" → เปลี่ยนเป็น "or") — ช่องซ้ายต้องเหมือนที่ขึ้นใน History เป๊ะ ไม่ใช่คำที่คุณตั้งใจพูด</p>
      <div class="mb-4.5 flex gap-2">
        <label for="corr-from-input" class="sr-only">คำที่มักถูกแปลงผิด</label>
        <input id="corr-from-input" type="text" placeholder="คำที่มักถูกแปลงผิด" class="input input-sm min-w-0 flex-1" />
        <span class="flex items-center text-base-content/25" aria-hidden="true">→</span>
        <label for="corr-to-input" class="sr-only">คำที่ต้องการให้ออกจริง</label>
        <input id="corr-to-input" type="text" placeholder="คำที่ต้องการให้ออกจริง" class="input input-sm min-w-0 flex-1" />
        <button id="add-corr-btn" class="btn btn-neutral btn-sm">${icons.plus}<span>เพิ่ม</span></button>
      </div>
      <ul class="list rounded-xl border border-base-300 bg-base-100" id="corr-list">
        ${
          corrections.length === 0
            ? `<li class="py-10 text-center text-sm text-base-content/40">ยังไม่มี correction rule</li>`
            : corrections
                .map(
                  (c, i) => `
              <li class="list-row items-center gap-3 border-b border-base-200 px-3.5 py-2.5 text-[13px] last:border-b-0">
                <span class="min-w-0 truncate">${escapeHtml(c.from)}</span>
                <span class="text-base-content/25" aria-hidden="true">→</span>
                <span class="list-col-grow min-w-0 truncate font-medium">${escapeHtml(c.to)}</span>
                <button data-index="${i}" aria-label="ลบ correction rule ${escapeHtml(c.from)} ไป ${escapeHtml(c.to)}" class="btn btn-circle btn-ghost btn-xs [&_svg]:h-[11px] [&_svg]:w-[11px]">${icons.x}</button>
              </li>
            `,
                )
                .join("")
        }
      </ul>
    `;

    if (loadError) {
      showError(loadError);
      loadError = undefined;
    }

    const input = document.getElementById("dict-input") as HTMLInputElement;
    const addBtn = document.getElementById("add-btn")!;

    async function addWord() {
      const value = input.value.trim();
      if (!value) return;
      try {
        words = await window.typeless.setDictionary([...words, value]);
        input.value = "";
        render();
      } catch (err) {
        showError(err);
      }
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
        try {
          words = await window.typeless.setDictionary(
            words.filter((w) => w !== btn.dataset.word),
          );
          render();
        } catch (err) {
          showError(err);
        }
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
      try {
        corrections = await window.typeless.setCorrections([
          ...corrections,
          { from, to },
        ]);
        fromInput.value = "";
        toInput.value = "";
        render();
      } catch (err) {
        showError(err);
      }
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
        if (!Number.isInteger(index) || index < 0) return;
        try {
          corrections = await window.typeless.setCorrections(
            corrections.filter((_, i) => i !== index),
          );
          render();
        } catch (err) {
          showError(err);
        }
      });
  }

  render();
}
