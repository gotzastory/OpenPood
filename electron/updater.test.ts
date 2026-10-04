import { EventEmitter } from 'node:events';
import type { AppUpdater } from 'electron-updater';
import { describe, expect, it, vi } from 'vitest';
import { UpdateController } from './updater';

function fixture(enabled = true) {
  const events = new EventEmitter();
  const client = Object.assign(events, {
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
  const controller = new UpdateController(client as unknown as AppUpdater, '1.0.1', enabled, () => busy, publish, prepare, restore);
  return { client, controller, publish, prepare, restore, setBusy: (value: boolean) => { busy = value; } };
}

describe('desktop updates', () => {
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
    const dev = fixture(false);
    await dev.controller.check(); await dev.controller.download(); dev.controller.install();
    expect(dev.controller.getStatus().phase).toBe('disabled');
    expect(dev.client.checkForUpdates).not.toHaveBeenCalled();
  });
  it('bounds progress and limits release note text', () => {
    const { client, controller } = fixture();
    client.emit('download-progress', { percent: 200 });
    expect(controller.getStatus().percent).toBe(100);
    client.emit('update-available', { version: '1.0.2', releaseNotes: [{ version: '1.0.2', note: 'x'.repeat(9000) }] });
    expect(controller.getStatus().releaseNotes).toHaveLength(8000);
  });
});
