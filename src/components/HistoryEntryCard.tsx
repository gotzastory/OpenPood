import { icons } from "../lib/icons";
import { Icon } from "./Icon";
import type { HistoryEntry } from "../types";
import { BTN } from "../lib/uiClasses";

export function HistoryEntryCard({
  entry,
  copied,
  onCopy,
}: {
  entry: HistoryEntry;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <article className="border-b border-base-300 last:border-b-0">
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/65">
          <span>{new Date(entry.timestamp).toLocaleString("th-TH")}</span>
          <span className="max-w-full break-all font-mono text-base-content/80">
            {entry.model || "ไม่ระบุโมเดล"}
          </span>
          <span>{entry.wordCount} คำ</span>
          <span>{(entry.durationMs / 1000).toFixed(1)}s</span>
          <button type="button" className={`${BTN} ml-auto`} onClick={onCopy}>
            <Icon svg={copied ? icons.check : icons.copy} />
            <span>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
          </button>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {entry.text || <i>(ว่าง)</i>}
        </p>
      </div>
    </article>
  );
}
