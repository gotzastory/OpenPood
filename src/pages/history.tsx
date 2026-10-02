import { useEffect, useRef, useState } from "react";
import { icons } from "../icons";
import type { HistoryEntry } from "../types";
import { BTN, EMPTY_STATE, PAGE_TITLE } from "../uiClasses";

function Icon({ svg }: { svg: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        const nextEntries = await window.typeless.listHistory();
        if (!active) return;
        setEntries(nextEntries);
        setLoadError(false);
      } catch (err) {
        console.error(err);
        if (active) setLoadError(true);
      }
    };

    const unsubscribe = window.typeless.onHistoryUpdated(() => {
      void loadHistory();
    });
    void loadHistory();
    document.getElementById("content")?.focus({ preventScroll: true });

    return () => {
      active = false;
      unsubscribe();
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const clearHistory = async () => {
    if (!confirm("ลบประวัติการอัดเสียงทั้งหมด? ทำย้อนกลับไม่ได้")) return;

    try {
      setEntries(await window.typeless.clearHistory());
      setStatus("ล้างประวัติแล้ว");
    } catch (err) {
      console.error(err);
      setStatus("ล้างประวัติไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const copyEntry = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopiedId(entry.id);
      setStatus("คัดลอกข้อความแล้ว");
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
      copyResetTimer.current = window.setTimeout(() => {
        setCopiedId(null);
        copyResetTimer.current = null;
      }, 1200);
    } catch (err) {
      console.error(err);
      setStatus("คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  return (
    <div className="mx-auto max-w-[920px]">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className={PAGE_TITLE}>History</h1>
          <p className="mt-1 text-sm text-base-content/65">
            ย้อนดูและคัดลอกข้อความที่ถอดเสียงไว้ในเครื่องนี้
          </p>
        </div>
        <button
          type="button"
          className={BTN}
          disabled={!entries?.length}
          onClick={() => void clearHistory()}
        >
          <Icon svg={icons.trash} />
          <span>ล้างประวัติ</span>
        </button>
      </header>

      <div className="sr-only" aria-live="polite">
        {status}
      </div>

      {loadError ? (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          โหลดประวัติไม่สำเร็จ กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries === null ? (
            <div className={EMPTY_STATE}>กำลังโหลดประวัติ...</div>
          ) : entries.length === 0 ? (
            <div className={EMPTY_STATE}>ยังไม่มีประวัติการอัดเสียง</div>
          ) : (
            entries.map((entry) => (
              <article key={entry.id} className="card card-border bg-base-100">
                <div className="card-body gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/65">
                    <span>{new Date(entry.timestamp).toLocaleString("th-TH")}</span>
                    <span>{entry.wordCount} คำ</span>
                    <span>{(entry.durationMs / 1000).toFixed(1)}s</span>
                    <button
                      type="button"
                      className={`${BTN} ml-auto`}
                      onClick={() => void copyEntry(entry)}
                    >
                      <Icon svg={copiedId === entry.id ? icons.check : icons.copy} />
                      <span>{copiedId === entry.id ? "คัดลอกแล้ว" : "คัดลอก"}</span>
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {entry.text || <i>(ว่าง)</i>}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
