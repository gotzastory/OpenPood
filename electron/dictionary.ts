import Store from 'electron-store';

export interface CorrectionRule {
  from: string;
  to: string;
}

interface DictionarySchema {
  words: string[];
  corrections: CorrectionRule[];
}

const dictionaryStore = new Store<DictionarySchema>({
  name: 'dictionary',
  defaults: { words: [], corrections: [] },
});

export function listDictionaryWords(): string[] {
  return dictionaryStore.get('words');
}

export function setDictionaryWords(words: string[]): string[] {
  const cleaned = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
  dictionaryStore.set('words', cleaned);
  return cleaned;
}

export function listCorrections(): CorrectionRule[] {
  return dictionaryStore.get('corrections');
}

export function setCorrections(rules: CorrectionRule[]): CorrectionRule[] {
  const cleaned = rules
    .map((r) => ({ from: r.from.trim(), to: r.to.trim() }))
    .filter((r) => r.from && r.to);
  dictionaryStore.set('corrections', cleaned);
  return cleaned;
}

// Literal substring replace (not regex) — rules are user-typed words/phrases,
// not patterns, so treat `from` as exact text to avoid surprising regex
// special-character behavior.
export function applyCorrections(text: string): string {
  return listCorrections().reduce(
    (result, { from, to }) => result.split(from).join(to),
    text,
  );
}

export function dictionaryPrompt(): string {
  const words = listDictionaryWords();
  if (words.length === 0) return '';
  // Whisper's `prompt` biases toward text that reads like real preceding context,
  // not a bare word list — embedding the words in a natural sentence in the
  // expected output style (mixed Thai/English) makes the bias noticeably stronger,
  // e.g. correcting Thai-accented English words that would otherwise be
  // mis-transcribed as similar-sounding Thai words.
  return `คำศัพท์ที่มักพูดถึง เช่น ${words.join(', ')}`;
}
