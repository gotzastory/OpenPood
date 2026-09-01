// Deterministic filler / disfluency stripper — no LLM, no network.
// Runs after STT so "อืมม" / "เอ่ออ" / "um" never reach the paste target.
//
// IMPORTANT ORDERING: this must run on the RAW transcript, BEFORE
// normalizeThaiSpacing collapses the spaces Whisper puts between Thai words.
// Those spaces are what let the patterns below anchor to whole tokens —
// matching fillers mid-string (the old approach) destroyed real words that
// merely start with a filler shape (อ่าน → น, อ่าง → ง, อูมามิ → ามิ).
// A filler glued directly to the next word (no space) is left alone: missing
// one is far cheaper than eating a real word.

// Thai fillers as complete tokens: bounded by start/whitespace/punctuation on
// both sides. Elongations (อืมมม, เอ่ออ, อ่าาา) collapse into the same match.
// Plain "เออ" is deliberately NOT stripped — it's an agreement word ("yeah"),
// not hesitation; only the tone-marked เอ่อ/เอ้อ forms are.
const THAI_FILLERS = new RegExp(
  ['อื้?ม+', 'เอ[่้]อ+', 'อ[่๊]า+', 'อูม+']
    .map((p) => `(?<=^|[\\s,。.!?])(?:${p})(?=$|[\\s,。.!?])`)
    .join('|'),
  'gu',
);

const ENGLISH_FILLERS =
  // Standalone Latin hesitations only — \b keeps "summer"/"error" safe, and
  // the hyphen guards keep compounds like "uh-huh" intact.
  /(?<!-)\b(?:um+|uh+|uhm+|er+|ah+|hm+)\b(?!-)/gi;

export function stripFillers(text: string): string {
  if (!text.trim()) return text;

  let out = text.replace(THAI_FILLERS, '').replace(ENGLISH_FILLERS, '');

  // Collapse leftover punctuation/spacing left by removed fillers.
  out = out
    .replace(/([,，、])\s*\1+/g, '$1')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return out;
}
