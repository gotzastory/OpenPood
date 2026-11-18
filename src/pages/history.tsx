import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { icons } from "../lib/icons";
import type { HistoryEntry } from "../types";
import { BTN, EMPTY_STATE, PAGE_TITLE } from "../lib/uiClasses";
import { StatusToast } from "../components/StatusToast";
import { HistoryEntryCard } from "../components/HistoryEntryCard";
import { RUNTIME } from '../lib/runtimeConfig';

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyResetTimer = useRef<number | null>(null);
  const [page, setPage] = useState(0);
  const [saveHistory, setSaveHistory] = useState(true);
  const pageCount = Math.max(1, Math.ceil((entries?.length ?? 0) / RUNTIME.historyPageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleEntries = entries?.slice(currentPage * RUNTIME.historyPageSize, (currentPage + 1) * RUNTIME.historyPageSize);

  useEffect(() => {
    let active = true;
    let loadSequence = 0;

    const loadHistory = async () => {
      const sequence = ++loadSequence;
      try {
        const nextEntries = await window.typeless.listHistory();
        if (!active || sequence !== loadSequence) return;
        setEntries(nextEntries);
        setLoadError(false);
      } catch (err) {
        console.error(err);
        if (active && sequence === loadSequence) setLoadError(true);
      }
    };

    const unsubscribe = window.typeless.onHistoryUpdated(() => {
      void loadHistory();
    });
    void loadHistory();
    void window.typeless.getSettings().then((settings) => {
      if (active) setSaveHistory(settings.saveHistory);
    }).catch(() => undefined);
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
      setPage(0);
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
    <div className="mx-auto max-w-5xl">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className={PAGE_TITLE}>ประวัติการถอดเสียง</h1>
          <p className="mt-1 text-sm text-secondary">
            ข้อความถูกเข้ารหัสเก็บในเครื่องนี้
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

      {!saveHistory && (
        <div role="status" className="alert alert-warning alert-soft mb-4 text-sm">
          การบันทึกประวัติถูกปิดอยู่ในการตั้งค่า
        </div>
      )}

      <StatusToast text={status} kind={status.includes("ไม่สำเร็จ") ? "error" : "success"} />

      {loadError ? (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          โหลดประวัติไม่สำเร็จ กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง
        </div>
      ) : entries === null ? (
        <div className={EMPTY_STATE} role="status">
          <span className="loading loading-spinner loading-sm mr-2 align-middle" aria-hidden="true" />
          กำลังโหลดประวัติ...
        </div>
      ) : entries.length === 0 ? (
        <div className={EMPTY_STATE}>ยังไม่มีประวัติการอัดเสียง</div>
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ข้อความ</th>
                <th>โมเดล</th>
                <th>คำ</th>
                <th>ระยะเวลา</th>
                <th><span className="sr-only">การทำงาน</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries?.map((entry) => (
                <HistoryEntryCard
                  key={entry.id}
                  entry={entry}
                  copied={copiedId === entry.id}
                  onCopy={() => void copyEntry(entry)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loadError && pageCount > 1 && (
        <nav aria-label="หน้าประวัติ" className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-secondary">หน้า {currentPage + 1} / {pageCount} · {entries?.length} รายการ</p>
          <div className="join">
            <button type="button" className="btn join-item" disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button>
            <button type="button" className="btn join-item" disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}>ถัดไป</button>
          </div>
        </nav>
      )}
    </div>
  );
}
