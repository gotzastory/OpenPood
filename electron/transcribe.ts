import type { AppSettings } from './config';

export class TranscriptionError extends Error {}

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

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  promptBias = '',
): Promise<string> {
  if (!settings.apiKey) {
    throw new TranscriptionError('ยังไม่ได้ตั้งค่า API key ในหน้า Settings');
  }

  const ext = mimeType.includes('webm') ? 'webm' : 'wav';
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', settings.model || 'whisper-1');
  if (settings.language) form.append('language', settings.language);
  if (promptBias) form.append('prompt', promptBias);

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
