import Store from 'electron-store';
import { safeStorage } from 'electron';

export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  hotkey: string;
  language: string;
  micDeviceId: string;
  launchAtStartup: boolean;
  playSound: boolean;
  maxDurationSec: number;
  onboardingCompleted: boolean;
  stripFillersEnabled: boolean;
  aiPolishEnabled: boolean;
  chatModel: string;
  translateHotkey: string;
  translateTargetLang: string;
}

// On disk, apiKey is kept as a base64-encoded blob encrypted via Electron's
// safeStorage (DPAPI on Windows) instead of plaintext — everywhere else in
// the app still deals with the plain AppSettings shape.
type StoredSettings = Omit<AppSettings, 'apiKey'> & { apiKeyEncrypted: string };

const defaults: StoredSettings = {
  apiKeyEncrypted: '',
  // Recommended stack: OpenRouter + Whisper Large V3 Turbo (STT) +
  // Gemini 3.5 Flash Lite (polish / translate).
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  model: 'openai/whisper-large-v3-turbo',
  hotkey: 'Control+Space',
  language: '',
  micDeviceId: '',
  launchAtStartup: false,
  playSound: true,
  maxDurationSec: 120,
  onboardingCompleted: false,
  stripFillersEnabled: true,
  aiPolishEnabled: false,
  chatModel: 'google/gemini-3.5-flash-lite',
  translateHotkey: 'Control+Alt+T',
  translateTargetLang: 'en',
};

// Shape sent to the renderer over `settings:get` — the plaintext key never
// crosses the IPC boundary; pages only learn whether one is saved.
export type RendererSettings = Omit<AppSettings, 'apiKey'> & {
  apiKey: '';
  hasApiKey: boolean;
};

const rawStore = new Store<StoredSettings>({ defaults });

// Runtime allowlist for `settings:set` — IPC payloads come from the renderer
// and must not be able to write arbitrary keys (incl. dotted paths) into the
// store. apiKey is handled separately via encryption.
const WRITABLE_KEYS = new Set<string>(
  Object.keys(defaults).filter((k) => k !== 'apiKeyEncrypted'),
);

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

// Reject plain-http remote endpoints: the Bearer token/API key is attached to
// every request, so a non-TLS base URL leaks it in cleartext (and doubles as
// an SSRF vector). http:// stays allowed for loopback so local Whisper /
// LM Studio / Ollama-style servers keep working.
export function validateApiBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'API Base URL ไม่ใช่ URL ที่ถูกต้อง';
  }
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return null;
  return 'API Base URL ต้องเป็น https:// (อนุญาต http:// เฉพาะ localhost)';
}

function encryptApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (!safeStorage.isEncryptionAvailable()) return apiKey;
  return safeStorage.encryptString(apiKey).toString('base64');
}

function decryptApiKey(stored: string): string {
  if (!stored) return '';
  if (!safeStorage.isEncryptionAvailable()) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    // Blob is corrupted or from another machine/OS user — treat as unset
    // rather than crash the app.
    return '';
  }
}

// Migrate installs that still have a plaintext `apiKey` field from before
// encryption was added.
const legacyApiKey = (rawStore.store as unknown as { apiKey?: string }).apiKey;
if (legacyApiKey && !rawStore.get('apiKeyEncrypted')) {
  rawStore.set('apiKeyEncrypted', encryptApiKey(legacyApiKey));
  (rawStore as unknown as { delete(key: string): void }).delete('apiKey');
}

export function getSettings(): AppSettings {
  const { apiKeyEncrypted, ...rest } = rawStore.store;
  return { ...rest, apiKey: decryptApiKey(apiKeyEncrypted) };
}

export function getRendererSettings(): RendererSettings {
  const { apiKey, ...rest } = getSettings();
  return { ...rest, apiKey: '', hasApiKey: apiKey.length > 0 };
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const { apiKey, ...rest } = partial;
  for (const [key, value] of Object.entries(rest)) {
    if (!WRITABLE_KEYS.has(key)) continue;
    // Value must match the default's primitive type — rejects objects, dotted
    // paths and type confusion from a compromised renderer.
    if (typeof value !== typeof (defaults as Record<string, unknown>)[key]) continue;
    if (key === 'apiBaseUrl') {
      const error = validateApiBaseUrl(value as string);
      if (error) throw new Error(error);
    }
    // Cast is safe: key membership and value type are checked above.
    rawStore.set(key as keyof StoredSettings, value as StoredSettings[keyof StoredSettings]);
  }
  if (typeof apiKey === 'string') {
    rawStore.set('apiKeyEncrypted', encryptApiKey(apiKey));
  }
  return getSettings();
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return getSettings()[key];
}
