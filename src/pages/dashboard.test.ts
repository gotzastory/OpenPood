import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveInitialTheme } from "./dashboard";

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

  it("falls back to the OS preference when storage throws", () => {
    stubEnvironment(() => {
      throw new Error("storage blocked");
    }, false);
    expect(resolveInitialTheme()).toBe("light");
  });
});
