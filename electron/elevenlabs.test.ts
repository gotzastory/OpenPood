import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from './config';
import { transcribeAudio, TranscriptionError } from './transcribe';
import { chatComplete, LlmError } from './llm';
import { ELEVENLABS_API_BASE, isElevenLabsProvider } from '../src/lib/elevenlabs';

const settings: AppSettings = {
  apiKey: 'test-only-key', apiBaseUrl: ELEVENLABS_API_BASE, model: 'scribe_v2',
  language: '', hotkey: 'Control+Space', micDeviceId: '', launchAtStartup: false,
  playSound: false, maxDurationSec: 120, onboardingCompleted: true,
  stripFillersEnabled: true, aiPolishEnabled: false, chatModel: '',
  translateHotkey: 'Control+Alt+T', translateTargetLang: 'en',
};
const audio = Buffer.from('test audio');
afterEach(() => vi.unstubAllGlobals());

describe('ElevenLabs STT integration', () => {
  it.each(['', 'th', 'en'])('uploads native multipart fields with language %j', async (language) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: ' สวัสดี hello ' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await transcribeAudio(audio, 'audio/webm;codecs=opus', { ...settings, language }, 'dictionary term'))
      .toBe('สวัสดี hello');
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ELEVENLABS_API_BASE}/speech-to-text`);
    expect(request.headers).toEqual({ 'xi-api-key': settings.apiKey });
    expect(request.redirect).toBe('error');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const form = request.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBe(language || 'th');
    expect(form.get('file')).toMatchObject({ name: 'audio.webm', size: audio.byteLength });
    expect(form.get('tag_audio_events')).toBe('false');
    expect(form.get('diarize')).toBe('false');
    expect(form.get('timestamps_granularity')).toBe('none');
    for (const field of ['model', 'prompt', 'keyterms', 'webhook', 'entity_detection']) {
      expect(form.has(field)).toBe(false);
    }
  });

  it('accepts a trailing slash and sends the selected Scribe v1 model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '' })));
    vi.stubGlobal('fetch', fetchMock);
    await transcribeAudio(audio, 'audio/wav', { ...settings, apiBaseUrl: `${ELEVENLABS_API_BASE}/`, model: 'scribe_v1' });
    expect(fetchMock.mock.calls[0][1].body.get('model_id')).toBe('scribe_v1');
    expect(fetchMock.mock.calls[0][1].body.get('file').name).toBe('audio.wav');
    expect(isElevenLabsProvider({ apiBaseUrl: 'https://api.elevenlabs.io.evil.test/v1' })).toBe(false);
  });

  it.each([401, 403, 422, 429, 500])('reports HTTP %s without echoing server bodies', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-server-body', { status })));
    await expect(transcribeAudio(audio, 'audio/webm', settings)).rejects.toThrow(`(${status})`);
    await expect(transcribeAudio(audio, 'audio/webm', settings)).rejects.not.toThrow('secret-server-body');
  });

  it.each(['not json', JSON.stringify({ text: 123 }), JSON.stringify({})])('rejects malformed responses', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(body)));
    await expect(transcribeAudio(audio, 'audio/webm', settings)).rejects.toBeInstanceOf(TranscriptionError);
  });

  it('wraps network failures without exposing transport details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret transport detail')));
    await expect(transcribeAudio(audio, 'audio/webm', settings)).rejects.toThrow('เชื่อมต่อ ElevenLabs');
  });

  it('does not upload without an API key or call a chat endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(transcribeAudio(audio, 'audio/webm', { ...settings, apiKey: '' })).rejects.toBeInstanceOf(TranscriptionError);
    await expect(chatComplete(settings, 'polish', 'hello')).rejects.toBeInstanceOf(LlmError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries wrong-script output through the native endpoint with Thai hint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'こんにちは世界' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'สวัสดี' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await transcribeAudio(audio, 'audio/webm', settings)).toBe('สวัสดี');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body.get('language_code')).toBe('th');
  });
});
