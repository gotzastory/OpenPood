import type { AppSettings } from './config';
import { geminiChatComplete, isGeminiProvider } from './gemini';
import { isElevenLabsProvider, ELEVENLABS_STT_ONLY_MESSAGE } from '../src/lib/elevenlabs';
import { providerJson, responseText, ProviderRequestError } from './providerRequest';
import { RUNTIME } from '../src/lib/runtimeConfig';

export class LlmError extends Error {}

// Shared chat-completion call used by AI polish and Translate —
// both need "system prompt + user text -> completion text" against
// whatever provider the user already configured for STT.
export async function chatComplete(
  settings: AppSettings,
  systemPrompt: string,
  userText: string,
  signal?: AbortSignal,
): Promise<string> {
  if (isElevenLabsProvider(settings)) {
    throw new LlmError(ELEVENLABS_STT_ONLY_MESSAGE);
  }
  if (!settings.apiKey) {
    throw new LlmError('ยังไม่ได้ตั้งค่า API key ในหน้า Settings');
  }

  if (isGeminiProvider(settings)) {
    try {
      return await geminiChatComplete(settings, systemPrompt, userText, signal);
    } catch (err) {
      throw new LlmError(err instanceof ProviderRequestError ? err.message : 'Gemini ปรับข้อความไม่สำเร็จ');
    }
  }

  try {
    const data = await providerJson(`${settings.apiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
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
    }, 'Chat completion API', RUNTIME.chatTimeoutMs, signal);
    const completion = data as { choices?: { message?: { content?: unknown } }[] } | null;
    const text = responseText(completion?.choices?.[0]?.message?.content, 'Chat completion API');
    if (!text) throw new LlmError('ผู้ให้บริการส่งข้อความว่าง — ลองใหม่อีกครั้ง');
    return text;
  } catch (err) {
    throw new LlmError(err instanceof ProviderRequestError || err instanceof LlmError ? err.message : 'ปรับข้อความไม่สำเร็จ');
  }
}
