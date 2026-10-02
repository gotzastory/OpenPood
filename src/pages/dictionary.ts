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
      <div class="mx-auto max-w-[920px]">
      <header class="mb-6">
        <h1 class="${PAGE_TITLE}">Dictionary</h1>
        <p class="mt-1 max-w-2xl text-sm leading-relaxed text-base-content/65">เพิ่มชื่อคน แบรนด์ และศัพท์เฉพาะเพื่อช่วยให้ระบบเลือกคำได้แม่นขึ้น</p>
      </header>
      <div id="dictionary-error" role="alert" class="alert alert-error alert-soft mb-4 hidden text-sm"></div>
      <section class="card card-border bg-base-100" aria-labelledby="dictionary-words-title">
        <div class="card-body gap-4 p-5">
          <div>
            <h2 id="dictionary-words-title" class="text-sm font-semibold">คำที่ต้องการให้รู้จัก</h2>
            <p class="mt-1 text-[13px] leading-relaxed text-base-content/65">ระบบจะใช้รายการนี้เป็นคำใบ้ ไม่ได้รับประกันว่าผลลัพธ์จะตรงทุกครั้ง</p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row">
            <label for="dict-input" class="sr-only">เพิ่มคำในพจนานุกรม</label>
            <input id="dict-input" type="text" placeholder="เช่น OpenPud, TypeScript" class="input input-sm min-w-0 flex-1" />
            <button id="add-btn" class="btn btn-neutral btn-sm">${icons.plus}<span>เพิ่มคำ</span></button>
          </div>
      <div class="flex flex-wrap gap-2" id="dict-chips">
        ${
          words.length === 0
            ? `<div class="w-full py-10 text-center text-sm text-base-content/65">ยังไม่มีคำในพจนานุกรม</div>`
            : words
                .map(
                  (w) =>
                    `<span class="badge badge-outline badge-lg h-auto max-w-full gap-1.5 py-1 pl-3 pr-1 text-[13px]"><span class="break-words">${escapeHtml(w)}</span><button data-word="${escapeHtml(w)}" aria-label="ลบคำ ${escapeHtml(w)}" class="btn btn-circle btn-ghost btn-sm min-h-8 w-8 shrink-0 [&_svg]:h-3 [&_svg]:w-3">${icons.x}</button></span>`,
                )
                .join("")
        }
      </div>
        </div>
      </section>

      <section class="mt-6" aria-labelledby="corrections-title">
      <h2 id="corrections-title" class="text-sm font-semibold">Correction rules</h2>
      <p class="mb-4 mt-1 max-w-2xl text-[13px] leading-relaxed text-base-content/65">แทนที่คำผิดหลังถอดเสียงแบบตรงตัว ช่องซ้ายต้องเหมือนข้อความที่เห็นใน History</p>
      <div class="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
        <label for="corr-from-input" class="sr-only">คำที่มักถูกแปลงผิด</label>
        <input id="corr-from-input" type="text" placeholder="คำที่มักถูกแปลงผิด" class="input input-sm min-w-0 flex-1" />
        <span class="hidden items-center text-base-content/35 sm:flex" aria-hidden="true">→</span>
        <label for="corr-to-input" class="sr-only">คำที่ต้องการให้ออกจริง</label>
        <input id="corr-to-input" type="text" placeholder="คำที่ต้องการให้ออกจริง" class="input input-sm min-w-0 flex-1" />
        <button id="add-corr-btn" class="btn btn-neutral btn-sm">${icons.plus}<span>เพิ่ม</span></button>
      </div>
      <ul class="list rounded-xl border border-base-300 bg-base-100" id="corr-list">
        ${
          corrections.length === 0
            ? `<li class="py-10 text-center text-sm text-base-content/65">ยังไม่มี correction rule</li>`
            : corrections
                .map(
                  (c, i) => `
              <li class="list-row items-center gap-3 border-b border-base-200 px-3.5 py-2.5 text-[13px] last:border-b-0">
                <span class="min-w-0 break-words">${escapeHtml(c.from)}</span>
                <span class="text-base-content/25" aria-hidden="true">→</span>
                <span class="list-col-grow min-w-0 break-words font-medium">${escapeHtml(c.to)}</span>
                <button data-index="${i}" aria-label="ลบ correction rule ${escapeHtml(c.from)} ไป ${escapeHtml(c.to)}" class="btn btn-circle btn-ghost btn-sm min-h-8 w-8 [&_svg]:h-3 [&_svg]:w-3">${icons.x}</button>
              </li>
            `,
                )
                .join("")
        }
      </ul>
      </section>
      </div>
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
