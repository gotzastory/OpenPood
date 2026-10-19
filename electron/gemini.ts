import type { AppSettings } from './config';
import { providerJson, responseText, ProviderRequestError } from './providerRequest';
import { RUNTIME } from '../src/lib/runtimeConfig';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Inline audio hard limit on generateContent (total request ≈ base64 + prompt).
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; status?: string };
}

export function isGeminiProvider(settings: Pick<AppSettings, 'apiBaseUrl'>): boolean {
  return settings.apiBaseUrl.replace(/\/$/, '') === GEMINI_API_BASE;
}

function normalizeAudioMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase();
  return base || 'audio/webm';
}

function extractText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  if (!Array.isArray(parts)) throw new ProviderRequestError('Gemini ส่งผลลัพธ์ไม่ถูกต้อง');
  return parts
    .map((p) => {
      if (!p || typeof p !== 'object') throw new ProviderRequestError('Gemini ส่งผลลัพธ์ไม่ถูกต้อง');
      responseText(p.text ?? '', 'Gemini API');
      return p.text ?? '';
    })
    .join('')
    .trim();
}

async function generateContent(
  settings: AppSettings,
  model: string,
  parts: GeminiPart[],
  systemInstruction?: string,
  temperature = 0.2,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature },
  };
  if (systemInstruction?.trim()) {
    body.systemInstruction = { parts: [{ text: systemInstruction.trim() }] };
  }

  const data = await providerJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
    body: JSON.stringify(body),
  }, 'Gemini API', parts.some((part) => part.inlineData) ? RUNTIME.sttTimeoutMs : RUNTIME.chatTimeoutMs, signal);
  if (!data || typeof data !== 'object') throw new ProviderRequestError('Gemini ส่งผลลัพธ์ไม่ถูกต้อง');
  const text = responseText(extractText(data as GeminiResponse), 'Gemini API');
  if (!text) throw new ProviderRequestError('Gemini ไม่พบข้อความหรือปฏิเสธคำขอ — ลองใหม่อีกครั้ง');
  return text;
}

export async function geminiChatComplete(
  settings: AppSettings,
  systemPrompt: string,
  userText: string,
  signal?: AbortSignal,
): Promise<string> {
  const model = settings.chatModel || 'gemini-3.5-flash-lite';
  return generateContent(settings, model, [{ text: userText }], systemPrompt, 0.3, signal);
}

export async function geminiTranscribe(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (audioBuffer.byteLength > MAX_INLINE_BYTES) {
    throw new ProviderRequestError(
      'ไฟล์เสียงใหญ่เกินขีดจำกัดของ Gemini inline upload (~18 MB) — ลองอัดสั้นลง',
    );
  }

  const model = settings.model || 'gemini-3.5-flash';
  return generateContent(
    settings,
    model,
    [
      { text: prompt },
      {
        inlineData: {
          mimeType: normalizeAudioMime(mimeType),
          data: audioBuffer.toString('base64'),
        },
      },
    ],
    undefined,
    0.1,
    signal,
  );
}
