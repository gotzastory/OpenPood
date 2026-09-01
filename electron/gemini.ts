import type { AppSettings } from './config';

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
  return parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

async function generateContent(
  settings: AppSettings,
  model: string,
  parts: GeminiPart[],
  systemInstruction?: string,
  temperature = 0.2,
): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature },
  };
  if (systemInstruction?.trim()) {
    body.systemInstruction = { parts: [{ text: systemInstruction.trim() }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    // Server-controlled body — cap it (it can end up in an OS notification).
    const msg = (data.error?.message || JSON.stringify(data)).slice(0, 300);
    throw new Error(`Gemini API error (${res.status}): ${msg}`);
  }

  return extractText(data);
}

export async function geminiChatComplete(
  settings: AppSettings,
  systemPrompt: string,
  userText: string,
): Promise<string> {
  const model = settings.chatModel || 'gemini-3.5-flash-lite';
  return generateContent(settings, model, [{ text: userText }], systemPrompt, 0.3);
}

export async function geminiTranscribe(
  audioBuffer: Buffer,
  mimeType: string,
  settings: AppSettings,
  prompt: string,
): Promise<string> {
  if (audioBuffer.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
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
  );
}
