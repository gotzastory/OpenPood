import type { AppSettings } from './config';
import { geminiTranscribe, isGeminiProvider } from './gemini';

export class TranscriptionError extends Error {}

// Whisper's `prompt` is preceding-context bias, not an instruction. A short
// Thai+English sample steers output toward mixed TH/EN even when the API
// `language` is locked to Thai (so English loanwords are less likely to be
// force-transliterated into Thai phonetics).
const TH_EN_PROMPT_BIAS =
  'สวัสดีครับ วันนี้คุยกันเป็นภาษาไทยและภาษาอังกฤษ เช่น hello world project API';

// Non-Latin scripts that should never appear in TH+EN dictation.
// Hangul, Devanagari, Arabic, Cyrillic, Hiragana/Katakana, CJK, Lao.
const UNEXPECTED_SCRIPT =
  /[\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E80-\u0EFF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/u;

// Vietnamese (and similar) uses Latin letters with diacritics English never has.
// Whisper often mis-labels Thai speech as Vietnamese — e.g. "Chưa chị, hãy nảy…"
const VIETNAMESE_LATIN =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/u;

// Whisper tends to insert a space between every Thai word/syllable, unlike
// normal Thai orthography which runs words together with no spaces. Collapse
// spaces that sit between two Thai characters, but keep spaces around
// non-Thai segments (English words, numbers) since Thai writing does put a
// space around embedded foreign text.
function normalizeThaiSpacing(text: string): string {
  return text
    .replace(/([฀-๿])\s+(?=[฀-๿])/gu, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function looksWrongLanguage(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length < 4) return false;

  let unexpected = 0;
  let vietnamese = 0;
  for (const ch of letters) {
    if (UNEXPECTED_SCRIPT.test(ch)) unexpected++;
    if (VIETNAMESE_LATIN.test(ch)) vietnamese++;
  }

  // A couple of Vietnamese-specific letters is enough — English doesn't use ư/ơ/đ.
  if (vietnamese >= 2 || vietnamese / letters.length >= 0.08) return true;

  return unexpected >= 3 || unexpected / letters.length >= 0.2;
}

function buildPrompt(promptBias: string): string {
  const extra = promptBias.trim();
  return extra ? `${TH_EN_PROMPT_BIAS} ${extra}` : TH_EN_PROMPT_BIAS;
}

// Gemini has no Whisper-style `language`/`prompt` fields — steer via instruction text.
function buildGeminiPrompt(promptBias: string, language: string): string {
  const langHint =
    language === 'en'
      ? 'Transcribe in English only.'
      : language === 'th'
        ? 'Transcribe primarily in Thai. Keep English words the speaker says in Latin script (do not transliterate them into Thai).'
        : 'The speaker mixes Thai and English. Write Thai in Thai script and English loanwords in Latin script.';
  const terms = promptBias.trim();
  return [
    'Transcribe the speech to plain text.',
    langHint,
    'Output ONLY the transcript — no titles, timestamps, speaker labels, or commentary.',
    `Language sample / spelling bias: ${TH_EN_PROMPT_BIAS}`,
    terms ? `Preferred spellings / terms: ${terms}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Empty settings.language means "Thai + English", not full auto-detect.
// Full auto-detect is what produced Japanese / Vietnamese / Korean ghosts.
function apiLanguage(settings: AppSettings): string {
  return settings.language || 'th';
}

async function requestTranscription(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  promptBias: string,
  language: string,
): Promise<string> {
  if (isGeminiProvider(settings)) {
    try {
      const text = await geminiTranscribe(
        audioBuffer,
        mimeType,
        settings,
        buildGeminiPrompt(promptBias, language),
      );
      return normalizeThaiSpacing(text);
    } catch (err) {
      throw new TranscriptionError(err instanceof Error ? err.message : String(err));
    }
  }

  const ext = mimeType.includes('webm') ? 'webm' : 'wav';
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', settings.model || 'openai/whisper-large-v3-turbo');
  form.append('language', language);
  form.append('prompt', buildPrompt(promptBias));

  const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TranscriptionError(`Transcription API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { text?: string };
  return normalizeThaiSpacing(data.text?.trim() ?? '');
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  promptBias = '',
): Promise<string> {
  if (!settings.apiKey) {
    throw new TranscriptionError('ยังไม่ได้ตั้งค่า API key ในหน้า Settings');
  }

  const language = apiLanguage(settings);
  let text = await requestTranscription(
    audioBuffer,
    mimeType,
    settings,
    promptBias,
    language,
  );

  // Safety net if a provider ignores `language` or still emits VN/JP/KR.
  if (looksWrongLanguage(text) && language !== 'en') {
    console.log('[transcribe] unexpected language detected, retrying with language=th + stronger bias');
    text = await requestTranscription(
      audioBuffer,
      mimeType,
      settings,
      // Repeat the bias so it sits at the end of the prompt (stronger influence).
      `${promptBias} ${TH_EN_PROMPT_BIAS}`,
      'th',
    );
  }

  return text;
}
