import type { AppSettings } from './config';
import { ELEVENLABS_DEFAULT_MODEL } from '../src/lib/elevenlabs';
import { providerJson, responseText, ProviderRequestError } from './providerRequest';
import { RUNTIME } from '../src/lib/runtimeConfig';

export async function elevenLabsTranscribe(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  language: string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  const ext = mimeType.includes('webm') ? 'webm' : 'wav';
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`);
  form.append('model_id', settings.model || ELEVENLABS_DEFAULT_MODEL);
  form.append('language_code', language);
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  form.append('timestamps_granularity', 'none');

  const data = await providerJson(`${settings.apiBaseUrl.replace(/\/$/, '')}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': settings.apiKey },
      body: form,
    }, 'ElevenLabs STT', RUNTIME.sttTimeoutMs, signal);
  if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string') {
    throw new ProviderRequestError('ElevenLabs ส่งผลลัพธ์ถอดเสียงไม่ถูกต้อง — ลองใหม่อีกครั้ง');
  }
  return responseText(data.text, 'ElevenLabs STT');
}
