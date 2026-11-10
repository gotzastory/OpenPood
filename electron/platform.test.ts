import { describe, expect, it } from 'vitest';
import {
  hotkeyFailureMessage,
  isAppImage,
  isDebInstall,
  pasteFallbackMessage,
  resolveUpdateChannel,
} from './platform';

describe('update channel selection', () => {
  it('enables in-app updates for Windows and AppImage only', () => {
    expect(resolveUpdateChannel({ packaged: true, platform: 'win32' })).toBe('in-app');
    expect(resolveUpdateChannel({ packaged: true, platform: 'linux', env: { APPIMAGE: '/tmp/OpenPood.AppImage' } })).toBe('in-app');
    expect(resolveUpdateChannel({ packaged: true, platform: 'darwin' })).toBe('browser');
    expect(resolveUpdateChannel({
      packaged: true,
      platform: 'linux',
      env: {},
      execPath: '/usr/bin/openpood',
    })).toBe('browser');
    expect(resolveUpdateChannel({ packaged: false, platform: 'win32' })).toBe('disabled');
  });

  it('detects AppImage and deb install layouts', () => {
    expect(isAppImage({ APPIMAGE: '/tmp/x.AppImage' })).toBe(true);
    expect(isDebInstall('/usr/lib/openpood/openpood', {}, 'linux')).toBe(true);
    expect(isDebInstall('/opt/OpenPood/openpood', {}, 'linux')).toBe(true);
    expect(isDebInstall('/home/user/AppDir/openpood', { APPIMAGE: '/tmp/x.AppImage' }, 'linux')).toBe(false);
    expect(isDebInstall('/usr/bin/openpood', {}, 'win32')).toBe(false);
  });
});

describe('Wayland / paste fallback messaging', () => {
  it('warns about Wayland hotkey limits without losing the paste path', () => {
    const message = hotkeyFailureMessage(['dictate'], { WAYLAND_DISPLAY: 'wayland-0' });
    expect(message.title).toContain('Wayland');
    expect(message.body).toContain('clipboard');
  });

  it('keeps transcribed text recoverable when injection tools are missing', () => {
    const message = pasteFallbackMessage('injection-unavailable', { WAYLAND_DISPLAY: 'wayland-1' });
    expect(message.body).toMatch(/Ctrl\+V|Cmd\+V/);
    expect(message.body).toContain('clipboard');
  });
});
