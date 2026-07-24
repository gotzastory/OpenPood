// Deterministic filler / disfluency stripper — no LLM, no network.
// Runs after STT so "อืมม" / "เอ่ออ" / "um" never reach the paste target.
// Thai orthography has no word spaces after normalizeThaiSpacing, so Thai
// patterns match by elongated filler shape rather than word boundaries.
//
// Each repeated consonant/vowel in a filler must NOT be followed by a Thai
// combining mark — otherwise greedy quantifiers steal the onset of the next
// syllable (e.g. อืมมมัน → wrongly matching อืมมม and leaving ัานดี).

// Thai vowels / tone / thanthakhat that attach to a preceding consonant.
const TH_MARK = '[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]';

const THAI_FILLERS = new RegExp(
  [
    // อืม อืมม อื้มม — each ม must not be an onset (ม + vowel mark)
    `อื้?(?:ม(?!${TH_MARK}))+`,
    // เออ เอ่อ เอ่ออ — same for trailing อ
    `เอ[่้]?(?:อ(?!${TH_MARK}))+`,
    // อ่า อ่าา / อ๊า
    `อ[่๊]า+`,
    // อูม อูมม
    `อู(?:ม(?!${TH_MARK}))+`,
  ].join('|'),
  'gu',
);

const ENGLISH_FILLERS =
  // Standalone Latin hesitations only — never touch real words like "summer".
  /\b(?:um+|uh+|uhm+|err*|ah+|hm+|hmm+)\b/gi;

export function stripFillers(text: string): string {
  if (!text.trim()) return text;

  let out = text.replace(THAI_FILLERS, '').replace(ENGLISH_FILLERS, '');

  // Collapse leftover punctuation/spacing left by removed fillers.
  out = out
    .replace(/([,，、])\s*\1+/g, '$1')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    // Re-collapse Thai↔Thai spaces opened by a removal between Thai segments.
    .replace(/([฀-๿])\s+(?=[฀-๿])/gu, '$1')
    .trim();

  return out;
}
