import type { AppSettings } from './config';

export class LlmError extends Error {}

// Shared chat-completion call used by AI polish, Translate, and Ask anything —
// all three just need "system prompt + user text -> completion text" against
// whatever OpenAI-compatible endpoint the user already configured for STT.
export async function chatComplete(
  settings: AppSettings,
  systemPrompt: string,
  userText: string,
): Promise<string> {
  if (!settings.apiKey) {
    throw new LlmError('ยังไม่ได้ตั้งค่า API key ในหน้า Settings');
  }

  const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.chatModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError(`Chat completion API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}
