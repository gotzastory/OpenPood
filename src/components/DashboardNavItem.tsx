interface DashboardNavItemProps {
  label: string;
  icon: string;
  active: boolean;
  onSelect: () => void;
}

const CLASS_NAME =
  "btn btn-ghost h-auto min-h-11 w-full justify-start gap-3 rounded-lg border-none px-3 text-left text-sm font-normal text-secondary shadow-none transition-colors hover:bg-base-200 hover:text-base-content data-[active=true]:bg-base-200 data-[active=true]:font-semibold data-[active=true]:text-primary";

export function DashboardNavItem({
  label,
  icon,
  active,
  onSelect,
}: DashboardNavItemProps) {
  return (
    <button
      type="button"
      className={CLASS_NAME}
      data-active={active}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} />
      <span>{label}</span>
    </button>
  );
}
