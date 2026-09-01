import { escapeHtml } from "./escape";

export function renderHotkeyBadges(hotkey: string): string {
  // Hotkey is free text persisted from settings/onboarding — escape it, or a
  // crafted value becomes stored XSS on the Home page.
  return hotkey
    .split("+")
    .map(
      (k) =>
        `<span class="rounded-[7px] border-[1.5px] border-neutral-300 bg-neutral-50 px-2.5 py-[5px] text-xs font-semibold text-neutral-700">${escapeHtml(k.trim())}</span>`,
    )
    .join("");
}

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(acceleratorKeyFromCode(e.code, e.key));
  return parts.join("+");
}

function acceleratorKeyFromCode(code: string, key: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (code === "Enter") return "Return";
  return key.length === 1 ? key.toUpperCase() : key;
}
