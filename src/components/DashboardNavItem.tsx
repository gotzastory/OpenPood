interface DashboardNavItemProps {
  label: string;
  icon: string;
  active: boolean;
  onSelect: () => void;
}

const CLASS_NAME =
  "btn btn-ghost h-auto min-h-10 w-full justify-start gap-2.5 rounded-lg border-none px-3 text-left text-sm font-normal text-base-content/65 shadow-none transition-colors [&_svg]:text-base-content/55 hover:bg-base-300/55 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/55 data-[active=true]:bg-base-100 data-[active=true]:font-semibold data-[active=true]:text-base-content data-[active=true]:shadow-sm data-[active=true]:[&_svg]:text-base-content";

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
