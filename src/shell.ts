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

const NAV_ITEM_CLASS =
  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-3 text-left text-sm text-base-content/65 transition-colors [&_svg]:text-base-content/55 hover:bg-base-300/55 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content/55 data-[active=true]:bg-base-100 data-[active=true]:font-semibold data-[active=true]:text-base-content data-[active=true]:shadow-sm data-[active=true]:[&_svg]:text-base-content";

function currentRoute(): Route {
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/history" || hash === "/dictionary" || hash === "/settings")
    return hash;
  return "/";
}

export function mountShell(root: HTMLElement) {
  root.innerHTML = `
    <div class="flex h-screen bg-base-200 text-base-content">
      <aside class="flex w-52 shrink-0 flex-col border-r border-base-300 bg-base-200 p-3" aria-label="เมนูหลัก">
        <div class="mb-5 flex items-center gap-2 px-2 py-2 text-[15px] font-bold [&_svg]:h-[22px] [&_svg]:w-[22px]" aria-label="OpenPud">${icons.logo}<span>OpenPud</span></div>
        <nav class="flex flex-col gap-1" id="nav" aria-label="หน้าหลัก"></nav>
        <div class="mt-auto border-t border-base-300 pt-3">
          <button id="nav-settings" class="${NAV_ITEM_CLASS}" title="Settings" aria-label="Settings">${icons.settings}<span>Settings</span></button>
        </div>
      </aside>
      <main class="dashboard-scrollbar min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10 lg:py-10" id="content" tabindex="-1"></main>
    </div>
  `;

  const nav = document.getElementById("nav")!;
  const content = document.getElementById("content")!;
  const navSettings = document.getElementById("nav-settings")!;

  function renderNav(active: Route) {
    nav.innerHTML = NAV_ITEMS.map(
      (item) => `
      <button class="${NAV_ITEM_CLASS}" data-route="${item.route}" data-active="${item.route === active}" ${item.route === active ? 'aria-current="page"' : ""}>
        ${item.icon}<span>${item.label}</span>
      </button>
    `,
    ).join("");
    nav
      .querySelectorAll<HTMLButtonElement>("button[data-route]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          location.hash = btn.dataset.route!;
        });
      });
    navSettings.dataset.active = String(active === "/settings");
    if (active === "/settings") navSettings.setAttribute("aria-current", "page");
    else navSettings.removeAttribute("aria-current");
  }

  async function renderPage(route: Route) {
    renderNav(route);
    content.scrollTop = 0;
    if (route === "/") await mountHome(content);
    if (route === "/history") await mountHistory(content);
    if (route === "/dictionary") await mountDictionary(content);
    if (route === "/settings") await mountSettings(content);
    content.focus({ preventScroll: true });
  }

  function showRoute(route: Route) {
    void renderPage(route).catch((err) => {
      console.error(err);
      content.innerHTML = `
        <div role="alert" class="alert alert-error alert-soft mx-auto max-w-xl text-sm">
          เปิดหน้านี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
        </div>
      `;
      content.focus({ preventScroll: true });
    });
  }

  navSettings.addEventListener("click", () => {
    location.hash = "/settings";
  });

  window.addEventListener("hashchange", () => showRoute(currentRoute()));
  window.typeless.onNavigate((route) => {
    const nextHash = `#${route}`;
    if (location.hash === nextHash) showRoute(currentRoute());
    else location.hash = route;
  });

  showRoute(currentRoute());
}
