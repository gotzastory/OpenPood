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
  "btn btn-ghost h-auto min-h-11 w-full justify-start gap-3 rounded-lg border-none px-3 text-left text-sm font-normal text-secondary shadow-none transition-colors hover:bg-base-200 hover:text-base-content data-[active=true]:bg-base-200 data-[active=true]:font-semibold data-[active=true]:text-primary";

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
      className={CLASS_NAME}
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
