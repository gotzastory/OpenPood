import { icons } from "../lib/icons";
import { Icon } from "./Icon";

export function DictionaryWord({ word, onRemove }: { word: string; onRemove: () => void }) {
  return (
    <span className="badge badge-outline badge-lg h-auto max-w-full gap-1.5 py-1 pr-1 pl-3 text-[13px]">
      <span className="break-words">{word}</span>
      <button
        type="button"
        aria-label={`ลบคำ ${word}`}
        className="btn btn-circle btn-ghost btn-sm min-h-8 w-8 shrink-0 [&_svg]:h-3 [&_svg]:w-3"
        onClick={onRemove}
      >
        <Icon svg={icons.x} />
      </button>
    </span>
  );
}
