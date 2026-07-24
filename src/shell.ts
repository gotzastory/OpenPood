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
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-2.5 text-left text-sm text-neutral-600 transition-colors [&_svg]:text-neutral-400 hover:bg-neutral-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 data-[active=true]:bg-white data-[active=true]:font-semibold data-[active=true]:text-neutral-900 data-[active=true]:shadow-sm data-[active=true]:[&_svg]:text-neutral-900";

function currentRoute(): Route {
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/history" || hash === "/dictionary" || hash === "/settings")
    return hash;
  return "/";
}

export function mountShell(root: HTMLElement) {
  root.innerHTML = `
    <div class="flex h-screen bg-neutral-50 text-neutral-900">
      <div class="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-100 p-3.5">
        <div class="mb-6 flex items-center gap-2 px-1.5 text-[15.5px] font-bold [&_svg]:h-[22px] [&_svg]:w-[22px]">${icons.logo}<span>OpenPud</span></div>
        <nav class="flex flex-col gap-0.5" id="nav"></nav>
        <div class="mt-auto px-0.5 py-1">
          <button id="nav-settings" class="${NAV_ITEM_CLASS} w-[34px] justify-center px-2" title="Settings" aria-label="Settings">${icons.settings}</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-11 py-10" id="content"></div>
    </div>
  `;

  const nav = document.getElementById("nav")!;
  const content = document.getElementById("content")!;
  const navSettings = document.getElementById("nav-settings")!;

  function renderNav(active: Route) {
    nav.innerHTML = NAV_ITEMS.map(
      (item) => `
      <button class="${NAV_ITEM_CLASS}" data-route="${item.route}" data-active="${item.route === active}">
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
  }

  async function renderPage(route: Route) {
    renderNav(route);
    content.scrollTop = 0;
    if (route === "/") return mountHome(content);
    if (route === "/history") return mountHistory(content);
    if (route === "/dictionary") return mountDictionary(content);
    if (route === "/settings") return mountSettings(content);
  }

  navSettings.addEventListener("click", () => {
    location.hash = "/settings";
  });

  window.addEventListener("hashchange", () => renderPage(currentRoute()));
  window.typeless.onNavigate((route) => {
    location.hash = route;
    renderPage(currentRoute());
  });

  renderPage(currentRoute());
}
