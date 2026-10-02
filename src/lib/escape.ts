// Shared HTML escaping for all template-literal markup. Unlike the old
// per-page `div.textContent` trick, this also escapes quotes so values are
// safe inside double- AND single-quoted attributes, not just text nodes.
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
