import type { AppSettings } from './config';
import { ELEVENLABS_DEFAULT_MODEL } from '../src/lib/elevenlabs';

const REQUEST_TIMEOUT_MS = 120_000;

export async function elevenLabsTranscribe(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  language: string,
): Promise<string> {
  const form = new FormData();
  const ext = mimeType.includes('webm') ? 'webm' : 'wav';
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`);
  form.append('model_id', settings.model || ELEVENLABS_DEFAULT_MODEL);
  form.append('language_code', language);
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  form.append('timestamps_granularity', 'none');

  let response: Response;
  try {
    response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': settings.apiKey },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });
  } catch {
    throw new Error('เชื่อมต่อ ElevenLabs ไม่สำเร็จหรือหมดเวลา — ตรวจสอบเครือข่ายแล้วลองใหม่');
  }
  // Never expose provider error bodies: they may echo credentials or audio data.
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403
      ? 'ตรวจสอบ API key และสิทธิ์ Speech to Text'
      : response.status === 429
        ? 'ตรวจสอบโควตาหรือรอสักครู่แล้วลองใหม่'
        : 'ตรวจสอบโมเดลและไฟล์เสียงแล้วลองใหม่';
    throw new Error(`ElevenLabs STT error (${response.status}): ${hint}`);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string') {
    throw new Error('ElevenLabs ส่งผลลัพธ์ถอดเสียงไม่ถูกต้อง — ลองใหม่อีกครั้ง');
  }
  return data.text.trim();
}
