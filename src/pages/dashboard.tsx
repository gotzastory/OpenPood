import { useEffect, useState } from "react";
import { DashboardNavItem } from "../components/DashboardNavItem";
import { icons } from "../lib/icons";
import { DictionaryPage } from "./dictionary";
import { HistoryPage } from "./history";
import { HomePage } from "./home";
import { SettingsPage } from "./settings";

type Route = "/" | "/history" | "/dictionary" | "/settings";

const NAV_ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: "/", label: "หน้าหลัก", icon: icons.home },
  { route: "/history", label: "ประวัติการถอดเสียง", icon: icons.history },
  { route: "/dictionary", label: "คำศัพท์", icon: icons.book },
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
    <div className="dashboard-shell flex h-screen bg-base-200 text-base-content">
      <aside
        className="flex w-48 shrink-0 flex-col border-r border-base-300 bg-base-100 p-4 lg:w-56"
        aria-label="เมนูหลัก"
      >
        <div className="mb-8 px-1 pt-1">
          <span className="brand-logo max-w-full" role="img" aria-label="OpenPood" />
          <p className="mt-1 px-1 text-xs text-secondary">พูดให้เป็นข้อความ</p>
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
        <div className="mt-auto border-t border-base-300 pt-4">
          <DashboardNavItem
            label="การตั้งค่า"
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
          <SettingsPage key={navigation.refreshKey} />
        )}
      </main>
    </div>
  );
}
