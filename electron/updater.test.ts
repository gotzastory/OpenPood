import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AppUpdater } from 'electron-updater';
import { describe, expect, it, vi } from 'vitest';
import { UpdateController, UPDATE_FEED } from './updater';

function fixture(channel: 'in-app' | 'browser' | 'disabled' = 'in-app') {
  const events = new EventEmitter();
  const client = Object.assign(events, {
    setFeedURL: vi.fn(),
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    checkForUpdates: vi.fn(async () => {
      events.emit('update-available', { version: '1.0.2', releaseNotes: '<script>untrusted</script>' });
      return {};
    }),
    downloadUpdate: vi.fn(async () => { events.emit('update-downloaded', { version: '1.0.2' }); return []; }),
    quitAndInstall: vi.fn(),
  });
  let busy = false;
  const publish = vi.fn();
  const prepare = vi.fn();
  const restore = vi.fn();
  const openExternal = vi.fn(async () => undefined);
  const controller = new UpdateController(client as unknown as AppUpdater, '1.0.1', channel, () => busy, publish, prepare, restore, openExternal);
  return { client, controller, publish, prepare, restore, openExternal, setBusy: (value: boolean) => { busy = value; } };
}

describe('desktop updates', () => {
  it('checks the OpenPood GitHub release feed', () => {
    const { client } = fixture();
    expect(client.setFeedURL).toHaveBeenCalledWith(UPDATE_FEED);
    expect(UPDATE_FEED.repo).toBe('OpenPood');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { build: { publish: { provider: string; owner: string; repo: string } } };
    expect(pkg.build.publish).toMatchObject({ provider: UPDATE_FEED.provider, owner: UPDATE_FEED.owner, repo: UPDATE_FEED.repo });
  });
  it('requires explicit download and install, and excludes prereleases/downgrades', async () => {
    const { client, controller } = fixture();
    expect(client.autoDownload).toBe(false);
    expect(client.autoInstallOnAppQuit).toBe(false);
    expect(client.allowPrerelease).toBe(false);
    expect(client.allowDowngrade).toBe(false);
    await controller.check();
    expect(controller.getStatus().phase).toBe('available');
    expect(client.downloadUpdate).not.toHaveBeenCalled();
    expect(controller.getStatus().releaseNotes).toBe('<script>untrusted</script>');
    await controller.download();
    expect(controller.getStatus().phase).toBe('downloaded');
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });
  it('blocks installation while dictation is busy, then installs only once', async () => {
    const { client, controller, prepare, setBusy } = fixture();
    controller.install();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
    await controller.check(); await controller.download();
    setBusy(true);
    expect(controller.install().busy).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    setBusy(false);
    controller.install(); controller.install();
    expect(prepare).toHaveBeenCalledOnce();
    expect(client.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
  });
  it('contains network errors without exposing server text and allows download retry', async () => {
    const { client, controller } = fixture();
    await controller.check();
    client.downloadUpdate.mockRejectedValueOnce(new Error('secret server response'));
    await controller.download();
    expect(controller.getStatus().phase).toBe('error');
    expect(controller.getStatus().error).not.toContain('secret');
    await controller.download();
    expect(controller.getStatus().phase).toBe('downloaded');
  });
  it('restores hotkeys when the installer fails and allows installation retry', async () => {
    const { client, controller, restore } = fixture();
    await controller.check(); await controller.download();
    client.quitAndInstall.mockImplementationOnce(() => client.emit('error', new Error('installer failed')));
    controller.install();
    expect(restore).toHaveBeenCalledOnce();
    expect(controller.isInstalling()).toBe(false);
    expect(controller.getStatus().phase).toBe('downloaded');
    controller.install();
    expect(client.quitAndInstall).toHaveBeenCalledTimes(2);
  });
  it('serializes checks and leaves dev builds disabled', async () => {
    const { client, controller } = fixture();
    let finish: ((value: object) => void) | undefined;
    client.checkForUpdates.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const check = controller.check();
    await controller.check(); await controller.download();
    expect(client.checkForUpdates).toHaveBeenCalledOnce();
    expect(client.downloadUpdate).not.toHaveBeenCalled();
    finish?.({}); await check;
    const dev = fixture('disabled');
    await dev.controller.check(); await dev.controller.download(); dev.controller.install();
    expect(dev.controller.getStatus().phase).toBe('disabled');
    expect(dev.controller.getStatus().channel).toBe('disabled');
    expect(dev.client.checkForUpdates).not.toHaveBeenCalled();
  });
  it('bounds progress and limits release note text', () => {
    const { client, controller } = fixture();
    client.emit('download-progress', { percent: 200 });
    expect(controller.getStatus().percent).toBe(100);
    client.emit('update-available', { version: '1.0.2', releaseNotes: [{ version: '1.0.2', note: 'x'.repeat(9000) }] });
    expect(controller.getStatus().releaseNotes).toHaveLength(8000);
  });
  it('opens GitHub Releases for unsigned macOS and .deb instead of auto-updating', async () => {
    const browser = fixture('browser');
    expect(browser.controller.getStatus().channel).toBe('browser');
    expect(browser.controller.supportsAutoCheck()).toBe(false);
    expect(browser.client.setFeedURL).not.toHaveBeenCalled();
    await browser.controller.check();
    expect(browser.openExternal).toHaveBeenCalledWith('https://github.com/gotzastory/OpenPood/releases/latest');
    expect(browser.client.checkForUpdates).not.toHaveBeenCalled();
    browser.openExternal.mockClear();
    await browser.controller.download();
    expect(browser.openExternal).toHaveBeenCalledWith('https://github.com/gotzastory/OpenPood/releases/latest');
    expect(browser.client.downloadUpdate).not.toHaveBeenCalled();
    browser.openExternal.mockClear();
    browser.controller.install();
    await vi.waitFor(() => expect(browser.openExternal).toHaveBeenCalledWith('https://github.com/gotzastory/OpenPood/releases/latest'));
    expect(browser.client.quitAndInstall).not.toHaveBeenCalled();
  });
  it('maps 404 / missing latest-linux.yml to unavailable instead of a network error', async () => {
    const { client, controller } = fixture();
    client.checkForUpdates.mockImplementationOnce(async () => {
      client.emit('error', new Error('Cannot find latest-linux.yml in the latest release artifacts (404)'));
      throw new Error('Cannot find latest-linux.yml in the latest release artifacts (404)');
    });
    await controller.check();
    expect(controller.getStatus().phase).toBe('unavailable');
    expect(controller.getStatus().error).toMatch(/แพลตฟอร์มนี้/);
    expect(controller.getStatus().error).not.toMatch(/อินเทอร์เน็ต/);
  });
  it('keeps connectivity failures as a network error phase', async () => {
    const { client, controller } = fixture();
    client.checkForUpdates.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND github.com'));
    await controller.check();
    expect(controller.getStatus().phase).toBe('error');
    expect(controller.getStatus().error).toMatch(/อินเทอร์เน็ต/);
  });
});
