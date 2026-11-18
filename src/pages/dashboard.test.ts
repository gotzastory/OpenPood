import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage, resolveInitialTheme } from "./dashboard";

function stubEnvironment(stored: string | null | (() => never), prefersDark: boolean) {
  vi.stubGlobal("localStorage", {
    getItem: typeof stored === "function" ? stored : () => stored,
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: prefersDark }),
  });
}

describe("resolveInitialTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the stored light or dark choice over the OS preference", () => {
    stubEnvironment("light", true);
    expect(resolveInitialTheme()).toBe("light");
    stubEnvironment("dark", false);
    expect(resolveInitialTheme()).toBe("dark");
  });

  it("ignores invalid stored values and follows the OS preference", () => {
    stubEnvironment("blue", true);
    expect(resolveInitialTheme()).toBe("dark");
    stubEnvironment("blue", false);
    expect(resolveInitialTheme()).toBe("light");
  });

  it("follows the OS preference when nothing is stored", () => {
    stubEnvironment(null, true);
    expect(resolveInitialTheme()).toBe("dark");
    stubEnvironment(null, false);
    expect(resolveInitialTheme()).toBe("light");
  });

  it("keeps a vertical menu and reserves the quit slot without adding quit", () => {
    vi.stubGlobal("location", { hash: "#/history" });
    vi.stubGlobal("localStorage", { getItem: () => "light", setItem: () => {} });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const html = renderToStaticMarkup(createElement(DashboardPage));
    expect(html).toContain("menu menu-vertical");
    expect(html).toContain('id="sidebar-quit-slot"');
    expect(html).toContain('data-slot="quit"');
    expect(html).toContain("หน้าหลัก");
    expect(html).toContain("ประวัติการถอดเสียง");
    expect(html).toContain("คำศัพท์");
    expect(html).toContain("แอป");
    expect(html).toContain("การตั้งค่า");
    expect(html).toContain("ธีมมืด");
    expect(html).not.toContain("ออกจากโปรแกรม");
    expect(html).not.toContain("quitApp");
  });

  it("falls back to the OS preference when storage throws", () => {
    stubEnvironment(() => {
      throw new Error("storage blocked");
    }, false);
    expect(resolveInitialTheme()).toBe("light");
  });
});
