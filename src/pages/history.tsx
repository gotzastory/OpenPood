import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { icons } from "../lib/icons";
import type { HistoryEntry } from "../types";
import { BTN, EMPTY_STATE, PAGE_TITLE } from "../lib/uiClasses";
import { HistoryEntryCard } from "../components/HistoryEntryCard";

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
          <h1 className={PAGE_TITLE}>ประวัติการถอดเสียง</h1>
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
        <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
          {entries === null ? (
            <div className={EMPTY_STATE}>กำลังโหลดประวัติ...</div>
          ) : entries.length === 0 ? (
            <div className={EMPTY_STATE}>ยังไม่มีประวัติการอัดเสียง</div>
          ) : (
            entries.map((entry) => (
              <HistoryEntryCard
                key={entry.id}
                entry={entry}
                copied={copiedId === entry.id}
                onCopy={() => void copyEntry(entry)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
