import type { ReactNode } from "react";

interface DashboardNavItemProps {
  label: string;
  icon: string;
  active: boolean;
  pressed?: boolean;
  /** Set for disclosure items; `controls` is the id of the panel they open. */
  expanded?: boolean;
  controls?: string;
  trailing?: ReactNode;
  onSelect: () => void;
}

const CLASS_NAME =
  "w-full cursor-pointer gap-3 text-left text-sm";

export function DashboardNavItem({
  label,
  icon,
  active,
  pressed,
  expanded,
  controls,
  trailing,
  onSelect,
}: DashboardNavItemProps) {
  return (
    <button
      type="button"
      className={`${CLASS_NAME}${active ? " menu-active font-semibold" : ""}`}
      data-active={active}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onSelect}
    >
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} />
      <span>{label}</span>
      {trailing}
    </button>
  );
}
