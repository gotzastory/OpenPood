import { useEffect, useState } from "react";
import { DashboardNavItem } from "./DashboardNavItem";
import { icons } from "../lib/icons";
import { BTN } from "../lib/uiClasses";
import type { UsageResult } from "../types";

// Dictation costs fractions of a cent, so small amounts keep more decimals.
export function formatCredits(value: number): string {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

const PANEL_ID = "usage-panel";

/** Sidebar disclosure for OpenRouter credit usage; renders nothing for other providers. */
export function UsageNavItem() {
  const [result, setResult] = useState<UsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    void window.typeless.getUsage()
      .catch((): UsageResult => ({ ok: false, error: "โหลด usage ไม่สำเร็จ" }))
      .then((next) => { setResult(next); setLoading(false); });
  };
  useEffect(load, []);

  if (!loading && result === null) return null;

  const usage = result?.ok ? result.usage : null;
  // Balance needs /credits; fall back to this key's lifetime spend.
  const headline = usage
    ? usage.balance !== null
      ? { label: "เครดิตคงเหลือ", value: usage.balance }
      : { label: "ใช้ทั้งหมด (key นี้)", value: usage.total }
    : null;
  const rows: [string, number][] = usage
    ? [["วันนี้", usage.daily], ["7 วันล่าสุด", usage.weekly], ["เดือนนี้", usage.monthly]]
    : [];

  return (
    <div>
      <DashboardNavItem
        label="เครดิต"
        icon={icons.wallet}
        active={false}
        expanded={open}
        controls={PANEL_ID}
        onSelect={() => setOpen((current) => !current)}
        trailing={
          <span className="ml-auto flex items-center gap-1 text-xs tabular-nums">
            {loading ? "..." : headline ? formatCredits(headline.value) : null}
            <span
              aria-hidden="true"
              className={`transition-transform motion-reduce:transition-none [&_svg]:h-3.5 [&_svg]:w-3.5 ${open ? "rotate-180" : ""}`}
              dangerouslySetInnerHTML={{ __html: icons.chevronDown }}
            />
          </span>
        }
      />
      {open && (
        <div id={PANEL_ID} className="mx-1 mt-1 mb-2 rounded-lg border border-base-300 bg-base-200 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base-content/65">{headline?.label ?? "เครดิต OpenRouter"}</p>
            <button
              type="button"
              className={`${BTN} btn-ghost btn-square btn-xs -my-1 text-base-content/65`}
              onClick={load}
              disabled={loading}
              aria-label="รีเฟรช"
              title="รีเฟรช"
            >
              <span
                aria-hidden="true"
                className={loading ? "motion-safe:animate-spin" : ""}
                dangerouslySetInnerHTML={{ __html: icons.refresh }}
              />
            </button>
          </div>
          {result && !result.ok && <p role="alert" className="mt-1 leading-relaxed text-error">{result.error}</p>}
          {headline && usage && (
            <>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-base-content">{formatCredits(headline.value)}</p>
              <dl className="mt-3 space-y-1.5 border-t border-base-300 pt-3">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-base-content/65">{label}</dt>
                    <dd className="font-semibold tabular-nums text-base-content">{formatCredits(value)}</dd>
                  </div>
                ))}
                {usage.keyLimitRemaining !== null && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-base-content/65">วงเงิน key เหลือ</dt>
                    <dd className="font-semibold tabular-nums text-base-content">{formatCredits(usage.keyLimitRemaining)}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </div>
      )}
    </div>
  );
}
