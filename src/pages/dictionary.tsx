import { type FormEvent, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { icons } from "../lib/icons";
import type { CorrectionRule } from "../types";
import { PAGE_TITLE } from "../lib/uiClasses";
import { CorrectionRule as CorrectionRuleItem } from "../components/CorrectionRule";
import { DictionaryWord } from "../components/DictionaryWord";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DictionaryPage() {
  const [words, setWords] = useState<string[] | null>(null);
  const [corrections, setCorrections] = useState<CorrectionRule[] | null>(null);
  const [tab, setTab] = useState<"words" | "rules">("words");
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
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className={PAGE_TITLE}>คำศัพท์</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
          เพิ่มชื่อคน แบรนด์ และศัพท์เฉพาะเพื่อช่วยให้ระบบเลือกคำได้แม่นขึ้น
        </p>
      </header>

      {error && (
        <div role="alert" className="alert alert-error alert-soft mb-4 text-sm">
          {error}
        </div>
      )}

      <div role="tablist" className="tabs tabs-border mb-4" aria-label="ส่วนของคำศัพท์">
        <button
          type="button"
          role="tab"
          id="dictionary-tab-words"
          aria-controls="dictionary-panel-words"
          aria-selected={tab === "words"}
          className={`tab ${tab === "words" ? "tab-active" : ""}`}
          onClick={() => setTab("words")}
        >
          คำที่ต้องการให้รู้จัก
        </button>
        <button
          type="button"
          role="tab"
          id="dictionary-tab-rules"
          aria-controls="dictionary-panel-rules"
          aria-selected={tab === "rules"}
          className={`tab ${tab === "rules" ? "tab-active" : ""}`}
          onClick={() => setTab("rules")}
        >
          กฎแก้คำ
        </button>
      </div>

      <section
        className="card card-border bg-base-100"
        id="dictionary-panel-words"
        role="tabpanel"
        aria-labelledby="dictionary-tab-words"
        hidden={tab !== "words"}
      >
        <div className="card-body gap-4 p-5">
          <div>
            <h2 id="dictionary-words-title" className="text-sm font-semibold">คำที่ต้องการให้รู้จัก</h2>
            <p className="mt-1 text-sm leading-relaxed text-secondary">
              ระบบจะใช้รายการนี้เป็นคำใบ้ ไม่ได้รับประกันว่าผลลัพธ์จะตรงทุกครั้ง
            </p>
          </div>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => void addWord(event)}>
            <label htmlFor="dict-input" className="label min-w-0 flex-1 flex-col items-stretch px-0">
              เพิ่มคำในพจนานุกรม
              <input
                id="dict-input"
                type="text"
                value={wordInput}
                onChange={(event) => setWordInput(event.target.value)}
                placeholder="เช่น OpenPood, TypeScript"
                className="input input-sm w-full"
              />
            </label>
            <button
              type="submit"
              className="dictionary-add-button btn btn-primary btn-sm"
              disabled={!words}
            >
              <Icon svg={icons.plus} />
              <span>เพิ่มคำ</span>
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {words === null ? (
              <div className="flex w-full items-center justify-center gap-2 py-10 text-sm text-secondary" role="status">
                <span className="loading loading-spinner loading-sm" aria-hidden="true" />
                กำลังโหลด...
              </div>
            ) : words.length === 0 ? (
              <div className="w-full py-10 text-center text-sm text-secondary">ยังไม่มีคำในพจนานุกรม</div>
            ) : (
              words.map((word) => (
                <DictionaryWord key={word} word={word} onRemove={() => void removeWord(word)} />
              ))
            )}
          </div>
        </div>
      </section>

      <section
        id="dictionary-panel-rules"
        role="tabpanel"
        aria-labelledby="dictionary-tab-rules"
        hidden={tab !== "rules"}
      >
        <h2 id="corrections-title" className="text-sm font-semibold">กฎแก้คำ</h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
          แทนที่คำผิดหลังถอดเสียงแบบตรงตัว ช่องซ้ายต้องเหมือนข้อความที่เห็นในประวัติ
        </p>
        <form className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => void addCorrection(event)}>
          <label htmlFor="corr-from-input" className="label min-w-0 flex-col items-stretch px-0">
            คำที่มักถูกแปลงผิด
            <input
              id="corr-from-input"
              type="text"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
              placeholder="คำที่มักถูกแปลงผิด"
              className="input input-sm w-full"
            />
          </label>
          <span className="hidden items-center pb-2 text-base-content/35 sm:flex" aria-hidden="true">→</span>
          <label htmlFor="corr-to-input" className="label min-w-0 flex-col items-stretch px-0">
            คำที่ต้องการให้ออกจริง
            <input
              id="corr-to-input"
              type="text"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
              placeholder="คำที่ต้องการให้ออกจริง"
              className="input input-sm w-full"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!corrections}>
            <Icon svg={icons.plus} />
            <span>เพิ่ม</span>
          </button>
        </form>
        <ul className="list rounded-box border border-base-300 bg-base-100">
          {corrections === null ? (
            <li className="flex items-center justify-center gap-2 py-10 text-sm text-secondary" role="status">
              <span className="loading loading-spinner loading-sm" aria-hidden="true" />
              กำลังโหลด...
            </li>
          ) : corrections.length === 0 ? (
            <li className="py-10 text-center text-sm text-secondary">ยังไม่มีกฎแก้คำ</li>
          ) : (
            corrections.map((correction, index) => (
              <CorrectionRuleItem
                key={`${correction.from}:${correction.to}:${index}`}
                correction={correction}
                onRemove={() => void removeCorrection(index)}
              />
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
