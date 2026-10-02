import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { mountHome } from "./pages/home";
import { mountHistory } from "./pages/history";
import { mountDictionary } from "./pages/dictionary";
import { mountSettings } from "./pages/settings";
import { icons } from "./icons";

type Route = "/" | "/history" | "/dictionary" | "/settings";

const NAV_ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: "/", label: "Home", icon: icons.home },
  { route: "/history", label: "History", icon: icons.history },
  { route: "/dictionary", label: "Dictionary", icon: icons.book },
];

const PAGE_MOUNTS: Record<Route, (root: HTMLElement) => Promise<void>> = {
  "/": mountHome,
  "/history": mountHistory,
  "/dictionary": mountDictionary,
  "/settings": mountSettings,
};

const NAV_ITEM_CLASS =
  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-3 text-left text-sm text-base-content/65 transition-colors [&_svg]:text-base-content/55 hover:bg-base-300/55 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/55 data-[active=true]:bg-base-100 data-[active=true]:font-semibold data-[active=true]:text-base-content data-[active=true]:shadow-sm data-[active=true]:[&_svg]:text-base-content";

export function routeFromHash(hash: string): Route {
  const route = hash.replace(/^#/, "") || "/";
  if (
    route === "/history" ||
    route === "/dictionary" ||
    route === "/settings"
  ) {
    return route;
  }
  return "/";
}

function Icon({ svg }: { svg: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function NavItem({
  route,
  label,
  icon,
  active,
}: {
  route: Route;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={NAV_ITEM_CLASS}
      data-active={active}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        location.hash = route;
      }}
    >
      <Icon svg={icon} />
      <span>{label}</span>
    </button>
  );
}

function LegacyPage({ route, refreshKey }: { route: Route; refreshKey: number }) {
  const pageRoot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const root = pageRoot.current;
    if (!root) return;

    let active = true;
    setError(false);
    void PAGE_MOUNTS[route](root)
      .then(() => {
        if (active) document.getElementById("content")?.focus({ preventScroll: true });
      })
      .catch((err: unknown) => {
        console.error(err);
        if (active) setError(true);
      });

    return () => {
      active = false;
      root.replaceChildren();
    };
  }, [route, refreshKey]);

  if (error) {
    return (
      <div role="alert" className="alert alert-error alert-soft mx-auto max-w-xl text-sm">
        เปิดหน้านี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
      </div>
    );
  }

  return <div ref={pageRoot} />;
}

function Dashboard() {
  const [navigation, setNavigation] = useState(() => ({
    route: routeFromHash(location.hash),
    refreshKey: 0,
  }));

  useEffect(() => {
    const showCurrentRoute = () => {
      setNavigation((current) => ({
        route: routeFromHash(location.hash),
        refreshKey: current.refreshKey + 1,
      }));
    };
    const unsubscribe = window.typeless.onNavigate((route) => {
      const nextHash = `#${route}`;
      if (location.hash === nextHash) showCurrentRoute();
      else location.hash = route;
    });

    window.addEventListener("hashchange", showCurrentRoute);
    return () => {
      window.removeEventListener("hashchange", showCurrentRoute);
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex h-screen bg-base-200 text-base-content">
      <aside
        className="flex w-52 shrink-0 flex-col border-r border-base-300 bg-base-200 p-3"
        aria-label="เมนูหลัก"
      >
        <div
          className="mb-5 flex items-center gap-2 px-2 py-2 text-[15px] font-bold [&_svg]:h-[22px] [&_svg]:w-[22px]"
          aria-label="OpenPud"
        >
          <Icon svg={icons.logo} />
          <span>OpenPud</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="หน้าหลัก">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.route}
              {...item}
              active={item.route === navigation.route}
            />
          ))}
        </nav>
        <div className="mt-auto border-t border-base-300 pt-3">
          <NavItem
            route="/settings"
            label="Settings"
            icon={icons.settings}
            active={navigation.route === "/settings"}
          />
        </div>
      </aside>
      <main
        className="dashboard-scrollbar min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10 lg:py-10"
        id="content"
        tabIndex={-1}
      >
        <LegacyPage
          key={`${navigation.route}:${navigation.refreshKey}`}
          route={navigation.route}
          refreshKey={navigation.refreshKey}
        />
      </main>
    </div>
  );
}

export function mountShell(root: HTMLElement) {
  createRoot(root).render(<Dashboard />);
}
