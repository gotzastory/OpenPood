import type { AppSettings } from './config';
import { geminiChatComplete, isGeminiProvider } from './gemini';
import { isElevenLabsProvider, ELEVENLABS_STT_ONLY_MESSAGE } from '../src/lib/elevenlabs';

export class LlmError extends Error {}

// Shared chat-completion call used by AI polish and Translate —
// both need "system prompt + user text -> completion text" against
// whatever provider the user already configured for STT.
export async function chatComplete(
  settings: AppSettings,
  systemPrompt: string,
  userText: string,
): Promise<string> {
  if (isElevenLabsProvider(settings)) {
    throw new LlmError(ELEVENLABS_STT_ONLY_MESSAGE);
  }
  if (!settings.apiKey) {
    throw new LlmError('ยังไม่ได้ตั้งค่า API key ในหน้า Settings');
  }

  if (isGeminiProvider(settings)) {
    try {
      return await geminiChatComplete(settings, systemPrompt, userText);
    } catch (err) {
      throw new LlmError(err instanceof Error ? err.message : String(err));
    }
  }

  const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.chatModel || 'google/gemini-3.5-flash-lite',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    // Server-controlled body — cap it (it can end up in an OS notification).
    const body = await res.text().catch(() => '');
    throw new LlmError(`Chat completion API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
