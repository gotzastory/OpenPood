// Shared provider configuration; API credentials remain in Electron main.
export const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
export const ELEVENLABS_DEFAULT_MODEL = 'scribe_v2';
export const ELEVENLABS_STT_ONLY_MESSAGE =
  'ElevenLabs รองรับเฉพาะถอดเสียงใน OpenPood — AI polish และ Translate ต้องเลือก provider อื่น';

export function isElevenLabsProvider(settings: { apiBaseUrl: string }): boolean {
  return settings.apiBaseUrl.replace(/\/$/, '') === ELEVENLABS_API_BASE;
}
