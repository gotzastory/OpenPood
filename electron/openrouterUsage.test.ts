import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOpenRouterUsage, OPENROUTER_API_BASE } from './openrouterUsage';
import type { AppSettings } from './config';

const settings: AppSettings = {
  apiKey: 'test-key', apiBaseUrl: OPENROUTER_API_BASE, model: 'test-stt',
  language: 'th', hotkey: 'Control+Space', micDeviceId: '', launchAtStartup: false,
  playSound: false, maxDurationSec: 120, onboardingCompleted: true,
  stripFillersEnabled: true, aiPolishEnabled: false, chatModel: 'test-chat',
  translateHotkey: 'Control+Alt+T', translateTargetLang: 'en',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { vi.unstubAllGlobals(); });

describe('getOpenRouterUsage', () => {
  it('combines key usage with the account balance', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url.endsWith('/key')
      ? json({ data: { usage: 12.5, usage_daily: 0.25, usage_weekly: 1, usage_monthly: 4, limit_remaining: null } })
      : json({ data: { total_credits: 20, total_usage: 12.5 } }))));
    await expect(getOpenRouterUsage(settings)).resolves.toEqual({ ok: true, usage: {
      daily: 0.25, weekly: 1, monthly: 4, total: 12.5, keyLimitRemaining: null, balance: 7.5,
    } });
  });
  it('still shows key usage when /credits is forbidden', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url.endsWith('/key')
      ? json({ data: { usage: 3, limit_remaining: 2 } })
      : json({}, 403))));
    const result = await getOpenRouterUsage(settings);
    expect(result).toMatchObject({ ok: true, usage: { total: 3, keyLimitRemaining: 2, balance: null } });
  });
  it('reports a safe error when the key is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'test-key' }, 401)));
    const result = await getOpenRouterUsage(settings);
    expect(result?.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('test-key');
  });
  it('skips non-OpenRouter providers without a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await getOpenRouterUsage({ ...settings, apiBaseUrl: 'https://api.openai.com/v1' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
