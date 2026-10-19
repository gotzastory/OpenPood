import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ available: true, writes: 0, initial: {} as Record<string, unknown>, current: {} as Record<string, unknown>, failWrite: false }));
vi.mock('./storage', () => ({ STORE_DIRECTORY: 'unused-test-directory' }));
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => state.available,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => {
    const decoded = value.toString();
    if (!decoded.startsWith('encrypted:')) throw new Error('invalid cipher');
    return decoded.slice('encrypted:'.length);
  },
} }));
vi.mock('electron-store', () => ({ default: class {
  constructor(options: { defaults: Record<string, unknown> }) { state.current = { ...options.defaults, ...state.initial }; }
  get store() { return { ...state.current }; }
  set store(value: Record<string, unknown>) {
    if (state.failWrite) throw new Error('disk full');
    ++state.writes; state.current = { ...value };
  }
} }));

beforeEach(() => { vi.resetModules(); state.available = true; state.writes = 0; state.initial = {}; state.failWrite = false; });
describe('settings security and atomic saves', () => {
  it('rejects key persistence if encryption is unavailable, without partially saving settings', async () => {
    const config = await import('./config');
    state.available = false;
    expect(() => config.setSettings({ model: 'changed', apiKey: 'private-key' })).toThrow('เข้ารหัส');
    expect(config.getSettings().model).not.toBe('changed');
    expect(state.writes).toBe(0);
    expect(JSON.stringify(state.current)).not.toContain('private-key');
  });
  it('redacts stored keys, including when encryption becomes unavailable', async () => {
    const config = await import('./config');
    config.setSettings({ apiKey: 'private-key' });
    expect(config.getRendererSettings()).toMatchObject({ apiKey: '', hasApiKey: true });
    expect(JSON.stringify(state.current)).not.toContain('private-key');
    state.available = false;
    expect(config.getSettings().apiKey).toBe('');
    expect(config.getRendererSettings().hasApiKey).toBe(false);
  });
  it('migrates a legacy key only when encryption is ready and removes plaintext', async () => {
    state.initial = { apiKey: 'legacy-key' }; state.available = false;
    const config = await import('./config');
    expect(config.getRendererSettings().apiKey).toBe('');
    expect(state.writes).toBe(0);
    state.available = true;
    expect(config.getSettings().apiKey).toBe('legacy-key');
    expect(state.current).not.toHaveProperty('apiKey');
    expect(state.writes).toBe(1);
  });
  it('validates the complete patch before writing and batches successful saves', async () => {
    const config = await import('./config');
    expect(() => config.setSettings({ model: 'changed', apiBaseUrl: 'http://remote.test' })).toThrow();
    expect(state.writes).toBe(0);
    config.setSettings({ model: 'changed', apiBaseUrl: 'http://localhost:9000', playSound: false });
    expect(state.writes).toBe(1);
    expect(config.getSettings().model).toBe('changed');
  });
  it.each([Number.NaN, Infinity, 0, -1, 601])('rejects invalid recording duration %s', async (maxDurationSec) => {
    const config = await import('./config');
    expect(() => config.setSettings({ maxDurationSec })).toThrow();
    expect(state.writes).toBe(0);
  });
  it('does not update cached settings if the disk write fails', async () => {
    const config = await import('./config');
    state.failWrite = true;
    expect(() => config.setSettings({ model: 'changed' })).toThrow();
    expect(config.getSettings().model).not.toBe('changed');
  });
});
