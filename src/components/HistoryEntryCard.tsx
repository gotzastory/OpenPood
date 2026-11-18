import { icons } from "../lib/icons";
import { Icon } from "./Icon";
import type { HistoryEntry } from "../types";

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
    <tr>
      <td className="whitespace-nowrap align-top text-xs text-secondary">
        {new Date(entry.timestamp).toLocaleString("th-TH")}
      </td>
      <td className="min-w-48 whitespace-pre-wrap break-words align-top text-sm leading-5">
        {entry.text || <i>(ว่าง)</i>}
      </td>
      <td className="max-w-48 align-top text-xs break-words text-secondary">
        {entry.model || "ไม่ระบุโมเดล"}
      </td>
      <td className="align-top text-xs tabular-nums text-secondary">{entry.wordCount}</td>
      <td className="align-top text-xs tabular-nums text-secondary">
        {(entry.durationMs / 1000).toFixed(1)} วิ
      </td>
      <td className="align-top text-right">
        <button type="button" className="btn btn-ghost btn-xs" onClick={onCopy}>
          <Icon svg={copied ? icons.check : icons.copy} />
          <span>{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
        </button>
      </td>
    </tr>
  );
}
