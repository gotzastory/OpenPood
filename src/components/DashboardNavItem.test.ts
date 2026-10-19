import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardNavItem } from "./DashboardNavItem";

const base = {
  label: "ธีมมืด",
  icon: "<svg></svg>",
  active: false,
  onSelect: () => {},
};

describe("DashboardNavItem", () => {
  it("omits aria-pressed when pressed is not provided", () => {
    const html = renderToStaticMarkup(createElement(DashboardNavItem, base));
    expect(html).not.toContain("aria-pressed");
  });

  it("exposes pressed state through aria-pressed", () => {
    const pressed = renderToStaticMarkup(
      createElement(DashboardNavItem, { ...base, pressed: true }),
    );
    const unpressed = renderToStaticMarkup(
      createElement(DashboardNavItem, { ...base, pressed: false }),
    );
    expect(pressed).toContain('aria-pressed="true"');
    expect(unpressed).toContain('aria-pressed="false"');
  });
});
