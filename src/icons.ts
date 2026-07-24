// Minimal hand-authored line-icon set (24x24 viewBox, stroke-based, Lucide-inspired)
// so the UI never relies on emoji glyphs, which render inconsistently across fonts/platforms.

function icon(paths: string, viewBox = "0 0 24 24"): string {
  return `<svg class="icon" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}

export const icons = {
  home: icon(
    '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  ),
  history: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  book: icon(
    '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5V4.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  ),
  settings: icon(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  ),
  mic: icon(
    '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/><path d="M8 22h8"/>',
  ),
  languages: icon(
    '<path d="M4 5h9"/><path d="M8.5 3v2"/><path d="M5 9c1.5 3 4 5 7 6"/><path d="M11 9c-1 2.5-2.5 4.5-4.5 6"/><path d="M14 21l4-9 4 9"/><path d="M15.2 18h5.6"/>',
  ),
  mail: icon(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  ),
  hash: icon(
    '<path d="M5 9h14"/><path d="M5 15h14"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  ),
  sparkles: icon(
    '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2.5 2.5"/><path d="m15.5 15.5 2.5 2.5"/><path d="m18 6-2.5 2.5"/><path d="m8.5 15.5-2.5 2.5"/><circle cx="12" cy="12" r="2.5"/>',
  ),
  fileText: icon(
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  ),
  messageCircle: icon(
    '<path d="M21 12a8.5 8.5 0 0 1-11.9 7.8L4 21l1.3-4.9A8.5 8.5 0 1 1 21 12Z"/>',
  ),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  zap: icon('<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>'),
  folder: icon(
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  ),
  lock: icon(
    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ),
  copy: icon(
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  ),
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  trash: icon(
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  ),
  x: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  plus: icon('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  logo: icon(
    '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" opacity="0.12"/><rect x="7" y="10" width="2" height="4" rx="1"/><rect x="11" y="7" width="2" height="10" rx="1"/><rect x="15" y="9" width="2" height="6" rx="1"/>',
  ),
};

export type IconName = keyof typeof icons;
