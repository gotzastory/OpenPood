import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerJson } from './providerRequest';
import { transcribeAudio } from './transcribe';
import { chatComplete } from './llm';
import { polishText } from './polish';
import type { AppSettings } from './config';
import { RUNTIME } from '../src/lib/runtimeConfig';
import { GEMINI_API_BASE } from './gemini';

const settings: AppSettings = {
  apiKey: 'test-key', apiBaseUrl: 'https://provider.test/v1', model: 'test-stt',
  language: 'th', hotkey: 'Control+Space', micDeviceId: '', launchAtStartup: false,
  playSound: false, maxDurationSec: 120, onboardingCompleted: true,
  stripFillersEnabled: true, aiPolishEnabled: false, chatModel: 'test-chat',
  translateHotkey: 'Control+Alt+T', translateTargetLang: 'en',
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('provider deadlines and safe errors', () => {
  it('aborts a request that never receives headers', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('secret transport detail')), { once: true });
    })));
    await expect(providerJson('https://provider.test', {}, 'STT', 15)).rejects.toThrow('หมดเวลา');
  });
  it('also times out a response whose body never finishes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }))));
    await expect(providerJson('https://provider.test', {}, 'STT', 15)).rejects.toThrow('หมดเวลา');
  });
  it('cancels an in-flight request and never echoes transport secrets', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('test-key')), { once: true });
    })));
    const work = providerJson('https://provider.test', {}, 'STT', 1000, controller.signal);
    controller.abort();
    await expect(work).rejects.toThrow('ยกเลิก');
  });
  it('does not start requests cancelled before dispatch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(providerJson('https://provider.test', {}, 'STT', 1000, AbortSignal.abort())).rejects.toThrow('ยกเลิก');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('maps HTTP %s without reading error bodies', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-key private transcript', { status })));
    await expect(providerJson('https://provider.test', {}, 'STT', 1000)).rejects.toThrow(`(${status})`);
    await expect(providerJson('https://provider.test', {}, 'STT', 1000)).rejects.not.toThrow('secret');
  });
  it('rejects invalid JSON and oversized responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('private non-json'))
      .mockResolvedValueOnce(new Response('x'.repeat(RUNTIME.maxResponseBytes + 1))));
    await expect(providerJson('https://provider.test', {}, 'STT', 1000)).rejects.toThrow('ไม่ถูกต้อง');
    await expect(providerJson('https://provider.test', {}, 'STT', 1000)).rejects.toThrow('ใหญ่เกิน');
  });
  it('sets a deadline and denies redirects for OpenAI-compatible requests', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ text: 'hello' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await transcribeAudio(Buffer.from('audio'), 'audio/webm', settings)).toBe('hello');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  });
  it.each(['{}', '{"text":42}', '{"text":"   "}'])('rejects unusable STT response %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(transcribeAudio(Buffer.from('audio'), 'audio/webm', settings)).rejects.toThrow();
  });
  it('rejects Gemini blocked/empty output rather than recording success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }))));
    await expect(transcribeAudio(Buffer.from('audio'), 'audio/webm', { ...settings, apiBaseUrl: GEMINI_API_BASE })).rejects.toThrow('ไม่พบข้อความ');
  });
  it('preserves whitespace between Gemini text parts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hello ' }, { text: 'world' }] } }] }))));
    expect(await transcribeAudio(Buffer.from('audio'), 'audio/webm', { ...settings, apiBaseUrl: GEMINI_API_BASE, language: 'en' })).toBe('hello world');
  });
  it('keeps raw dictation when polish fails, without logging server content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('private transcript test-key', { status: 500 })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await polishText('raw dictation', settings, 'general')).toBe('raw dictation');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('test-key');
    await expect(chatComplete(settings, 'translate', 'hello')).rejects.not.toThrow('private transcript');
  });
  it('does not fall back to raw text after cancellation of polish', async () => {
    await expect(polishText('raw', settings, 'general', AbortSignal.abort())).rejects.toThrow();
  });
});
