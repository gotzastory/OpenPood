import { describe, expect, it } from "vitest";
import { routeFromHash } from "./shell";

describe("routeFromHash", () => {
  it("accepts dashboard routes and falls back to home", () => {
    expect(routeFromHash("#/history")).toBe("/history");
    expect(routeFromHash("/settings")).toBe("/settings");
    expect(routeFromHash("#/not-allowed")).toBe("/");
  });
});
