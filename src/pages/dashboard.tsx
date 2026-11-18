import { useEffect, useLayoutEffect, useState } from "react";
import { DashboardNavItem } from "../components/DashboardNavItem";
import { UsageNavItem } from "../components/UsageNavItem";
import { icons } from "../lib/icons";
import { AppsPage } from "./apps";
import { DictionaryPage } from "./dictionary";
import { HistoryPage } from "./history";
import { HomePage } from "./home";
import { SettingsPage } from "./settings";

type Route = "/" | "/history" | "/dictionary" | "/apps" | "/settings";

const NAV_ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: "/", label: "หน้าหลัก", icon: icons.home },
  { route: "/history", label: "ประวัติการถอดเสียง", icon: icons.history },
  { route: "/dictionary", label: "คำศัพท์", icon: icons.book },
  { route: "/apps", label: "แอป", icon: icons.apps },
];

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "openpood-theme";

export function resolveInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable; fall back to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function routeFromHash(hash: string): Route {
  const route = hash.replace(/^#/, "") || "/";
  if (
    route === "/history" ||
    route === "/dictionary" ||
    route === "/apps" ||
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

  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Persistence is best-effort; the theme still applies for this session.
    }
  }, [theme]);

  return (
    <div className="dashboard-shell flex h-screen bg-base-200 text-base-content">
      <aside
        className="flex w-52 shrink-0 flex-col border-r border-base-300 bg-base-100"
        aria-label="เมนูหลัก"
      >
        <div className="px-4 pt-4 pb-2">
          <span className="brand-logo max-w-full" role="img" aria-label="OpenPood" />
          <p className="mt-1 px-1 text-xs text-secondary">พูดให้เป็นข้อความ</p>
        </div>
        <ul className="menu menu-vertical w-full flex-1 px-2" aria-label="หน้าหลัก">
          {NAV_ITEMS.map((item) => (
            <li key={item.route}>
              <DashboardNavItem
                label={item.label}
                icon={item.icon}
                active={item.route === navigation.route}
                onSelect={() => {
                  location.hash = item.route;
                }}
              />
            </li>
          ))}
        </ul>
        <ul className="menu menu-vertical mt-auto w-full border-t border-base-300 px-2 py-2" aria-label="เครื่องมือ">
          <UsageNavItem key={navigation.refreshKey} />
          <li>
            <DashboardNavItem
              label="ธีมมืด"
              icon={theme === "light" ? icons.moon : icons.sun}
              active={false}
              pressed={theme === "dark"}
              onSelect={() => {
                setTheme((current) => (current === "light" ? "dark" : "light"));
              }}
            />
          </li>
          <li>
            <DashboardNavItem
              label="การตั้งค่า"
              icon={icons.settings}
              active={navigation.route === "/settings"}
              onSelect={() => {
                location.hash = "/settings";
              }}
            />
          </li>
          {/* PR #6 appends DashboardNavItem label="ออกจากโปรแกรม" here.
              The slot stays in the footer menu and takes no height until that item exists. */}
          <li id="sidebar-quit-slot" data-slot="quit" hidden />
        </ul>
      </aside>
      <main
        className="dashboard-scrollbar min-w-0 flex-1 overflow-y-auto px-4 py-5 outline-none lg:px-8 lg:py-8"
        id="content"
        tabIndex={-1}
      >
        {navigation.route === "/" ? (
          <HomePage key={navigation.refreshKey} />
        ) : navigation.route === "/history" ? (
          <HistoryPage key={navigation.refreshKey} />
        ) : navigation.route === "/dictionary" ? (
          <DictionaryPage key={navigation.refreshKey} />
        ) : navigation.route === "/apps" ? (
          <AppsPage key={navigation.refreshKey} />
        ) : (
          <SettingsPage key={navigation.refreshKey} />
        )}
      </main>
    </div>
  );
}
