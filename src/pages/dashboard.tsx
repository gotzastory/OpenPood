import { useEffect, useRef, useState } from "react";
import { DashboardNavItem } from "../components/DashboardNavItem";
import { icons } from "../lib/icons";
import { DictionaryPage } from "./dictionary";
import { HistoryPage } from "./history";
import { HomePage } from "./home";
import { mountSettings } from "./settings";

type Route = "/" | "/history" | "/dictionary" | "/settings";

const NAV_ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: "/", label: "Home", icon: icons.home },
  { route: "/history", label: "History", icon: icons.history },
  { route: "/dictionary", label: "Dictionary", icon: icons.book },
];

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

function LegacySettings({ refreshKey }: { refreshKey: number }) {
  const pageRoot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const root = pageRoot.current;
    if (!root) return;

    let active = true;
    setError(false);
    void mountSettings(root)
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
  }, [refreshKey]);

  if (error) {
    return (
      <div role="alert" className="alert alert-error alert-soft mx-auto max-w-xl text-sm">
        เปิดหน้านี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
      </div>
    );
  }

  return <div ref={pageRoot} />;
}

export function DashboardPage() {
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
            <DashboardNavItem
              key={item.route}
              label={item.label}
              icon={item.icon}
              active={item.route === navigation.route}
              onSelect={() => {
                location.hash = item.route;
              }}
            />
          ))}
        </nav>
        <div className="mt-auto border-t border-base-300 pt-3">
          <DashboardNavItem
            label="Settings"
            icon={icons.settings}
            active={navigation.route === "/settings"}
            onSelect={() => {
              location.hash = "/settings";
            }}
          />
        </div>
      </aside>
      <main
        className="dashboard-scrollbar min-w-0 flex-1 overflow-y-auto px-6 py-8 outline-none lg:px-10 lg:py-10"
        id="content"
        tabIndex={-1}
      >
        {navigation.route === "/" ? (
          <HomePage key={navigation.refreshKey} />
        ) : navigation.route === "/history" ? (
          <HistoryPage key={navigation.refreshKey} />
        ) : navigation.route === "/dictionary" ? (
          <DictionaryPage key={navigation.refreshKey} />
        ) : (
          <LegacySettings key={navigation.refreshKey} refreshKey={navigation.refreshKey} />
        )}
      </main>
    </div>
  );
}
