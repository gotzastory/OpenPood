import { type FormEvent, useEffect, useState } from "react";
import { icons } from "../lib/icons";
import type { CorrectionRule } from "../types";
import { PAGE_TITLE } from "../lib/uiClasses";

function Icon({ svg }: { svg: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DictionaryPage() {
  const [words, setWords] = useState<string[] | null>(null);
  const [corrections, setCorrections] = useState<CorrectionRule[] | null>(null);
  const [wordInput, setWordInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.typeless.listDictionary(),
      window.typeless.listCorrections(),
    ])
      .then(([nextWords, nextCorrections]) => {
        if (!active) return;
        setWords(nextWords);
        setCorrections(nextCorrections);
      })
      .catch((err: unknown) => {
        console.error(err);
        if (active) setError(errorMessage(err));
      });
    document.getElementById("content")?.focus({ preventScroll: true });
    return () => {
      active = false;
    };
  }, []);

  const addWord = async (event: FormEvent) => {
    event.preventDefault();
    const value = wordInput.trim();
    if (!value || !words) return;
    try {
      setWords(await window.typeless.setDictionary([...words, value]));
      setWordInput("");
      setError("");
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    }
  };

  const removeWord = async (word: string) => {
    if (!words) return;
    try {
      setWords(await window.typeless.setDictionary(words.filter((item) => item !== word)));
      setError("");
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    }
  };

  const addCorrection = async (event: FormEvent) => {
    event.preventDefault();
    const from = fromInput.trim();
    const to = toInput.trim();
    if (!from || !to || !corrections) return;
    try {
      setCorrections(await window.typeless.setCorrections([...corrections, { from, to }]));
      setFromInput("");
      setToInput("");
      setError("");
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    }
  };

  const removeCorrection = async (index: number) => {
    if (!corrections) return;
    try {
      setCorrections(
        await window.typeless.setCorrections(corrections.filter((_, itemIndex) => itemIndex !== index)),
      );
      setError("");
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-[920px]">
      <header className="mb-6">
        <h1 className={PAGE_TITLE}>Dictionary</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-base-content/65">
          เพิ่มชื่อคน แบรนด์ และศัพท์เฉพาะเพื่อช่วยให้ระบบเลือกคำได้แม่นขึ้น
        </p>
      </header>

      {error && (
        <div role="alert" className="alert alert-error alert-soft mb-4 text-sm">
          {error}
        </div>
      )}

      <section className="card card-border bg-base-100" aria-labelledby="dictionary-words-title">
        <div className="card-body gap-4 p-5">
          <div>
            <h2 id="dictionary-words-title" className="text-sm font-semibold">คำที่ต้องการให้รู้จัก</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-base-content/65">
              ระบบจะใช้รายการนี้เป็นคำใบ้ ไม่ได้รับประกันว่าผลลัพธ์จะตรงทุกครั้ง
            </p>
          </div>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void addWord(event)}>
            <label htmlFor="dict-input" className="sr-only">เพิ่มคำในพจนานุกรม</label>
            <input
              id="dict-input"
              type="text"
              value={wordInput}
              onChange={(event) => setWordInput(event.target.value)}
              placeholder="เช่น OpenPud, TypeScript"
              className="input input-sm min-w-0 flex-1"
            />
            <button type="submit" className="btn btn-neutral btn-sm" disabled={!words}>
              <Icon svg={icons.plus} />
              <span>เพิ่มคำ</span>
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {words === null ? (
              <div className="w-full py-10 text-center text-sm text-base-content/65">กำลังโหลด...</div>
            ) : words.length === 0 ? (
              <div className="w-full py-10 text-center text-sm text-base-content/65">ยังไม่มีคำในพจนานุกรม</div>
            ) : (
              words.map((word) => (
                <span key={word} className="badge badge-outline badge-lg h-auto max-w-full gap-1.5 py-1 pr-1 pl-3 text-[13px]">
                  <span className="break-words">{word}</span>
                  <button
                    type="button"
                    aria-label={`ลบคำ ${word}`}
                    className="btn btn-circle btn-ghost btn-sm min-h-8 w-8 shrink-0 [&_svg]:h-3 [&_svg]:w-3"
                    onClick={() => void removeWord(word)}
                  >
                    <Icon svg={icons.x} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="corrections-title">
        <h2 id="corrections-title" className="text-sm font-semibold">Correction rules</h2>
        <p className="mb-4 mt-1 max-w-2xl text-[13px] leading-relaxed text-base-content/65">
          แทนที่คำผิดหลังถอดเสียงแบบตรงตัว ช่องซ้ายต้องเหมือนข้อความที่เห็นใน History
        </p>
        <form className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]" onSubmit={(event) => void addCorrection(event)}>
          <label htmlFor="corr-from-input" className="sr-only">คำที่มักถูกแปลงผิด</label>
          <input
            id="corr-from-input"
            type="text"
            value={fromInput}
            onChange={(event) => setFromInput(event.target.value)}
            placeholder="คำที่มักถูกแปลงผิด"
            className="input input-sm min-w-0 flex-1"
          />
          <span className="hidden items-center text-base-content/35 sm:flex" aria-hidden="true">→</span>
          <label htmlFor="corr-to-input" className="sr-only">คำที่ต้องการให้ออกจริง</label>
          <input
            id="corr-to-input"
            type="text"
            value={toInput}
            onChange={(event) => setToInput(event.target.value)}
            placeholder="คำที่ต้องการให้ออกจริง"
            className="input input-sm min-w-0 flex-1"
          />
          <button type="submit" className="btn btn-neutral btn-sm" disabled={!corrections}>
            <Icon svg={icons.plus} />
            <span>เพิ่ม</span>
          </button>
        </form>
        <ul className="list rounded-xl border border-base-300 bg-base-100">
          {corrections === null ? (
            <li className="py-10 text-center text-sm text-base-content/65">กำลังโหลด...</li>
          ) : corrections.length === 0 ? (
            <li className="py-10 text-center text-sm text-base-content/65">ยังไม่มี correction rule</li>
          ) : (
            corrections.map((correction, index) => (
              <li key={`${correction.from}:${correction.to}:${index}`} className="list-row items-center gap-3 border-b border-base-200 px-3.5 py-2.5 text-[13px] last:border-b-0">
                <span className="min-w-0 break-words">{correction.from}</span>
                <span className="text-base-content/25" aria-hidden="true">→</span>
                <span className="list-col-grow min-w-0 break-words font-medium">{correction.to}</span>
                <button
                  type="button"
                  aria-label={`ลบ correction rule ${correction.from} ไป ${correction.to}`}
                  className="btn btn-circle btn-ghost btn-sm min-h-8 w-8 [&_svg]:h-3 [&_svg]:w-3"
                  onClick={() => void removeCorrection(index)}
                >
                  <Icon svg={icons.x} />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
