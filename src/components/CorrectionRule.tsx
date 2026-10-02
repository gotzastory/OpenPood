import { icons } from "../lib/icons";
import type { CorrectionRule as CorrectionRuleType } from "../types";
import { Icon } from "./Icon";

export function CorrectionRule({
  correction,
  onRemove,
}: {
  correction: CorrectionRuleType;
  onRemove: () => void;
}) {
  return (
    <li className="list-row items-center gap-3 border-b border-base-200 px-3.5 py-2.5 text-[13px] last:border-b-0">
      <span className="min-w-0 break-words">{correction.from}</span>
      <span className="text-base-content/25" aria-hidden="true">→</span>
      <span className="list-col-grow min-w-0 break-words font-medium">{correction.to}</span>
      <button
        type="button"
        aria-label={`ลบ correction rule ${correction.from} ไป ${correction.to}`}
        className="btn btn-circle btn-ghost btn-sm min-h-8 w-8 [&_svg]:h-3 [&_svg]:w-3"
        onClick={onRemove}
      >
        <Icon svg={icons.x} />
      </button>
    </li>
  );
}
