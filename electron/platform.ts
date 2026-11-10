export type UpdateChannel = 'in-app' | 'browser' | 'disabled';

export function isWindows(platform = process.platform): boolean {
  return platform === 'win32';
}

export function isMac(platform = process.platform): boolean {
  return platform === 'darwin';
}

export function isLinux(platform = process.platform): boolean {
  return platform === 'linux';
}

export function isWayland(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WAYLAND_DISPLAY) || env.XDG_SESSION_TYPE === 'wayland';
}

export function isAppImage(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.APPIMAGE);
}

/** Heuristic for packages installed from a .deb into /usr or /opt. */
export function isDebInstall(
  execPath = process.execPath,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (isAppImage(env)) return false;
  if (!isLinux(platform)) return false;
  // Do not path.resolve(): on Windows that rewrites "/usr/..." to a drive path.
  const normalized = execPath.replaceAll('\\', '/');
  return normalized.startsWith('/usr/') || normalized.startsWith('/opt/');
}

export function releasesDownloadUrl(owner = 'gotzastory', repo = 'OpenPood'): string {
  return `https://github.com/${owner}/${repo}/releases/latest`;
}

/**
 * In-app auto-update only for Windows installers and Linux AppImage.
 * Unsigned macOS builds and .deb installs open the GitHub Releases page instead.
 */
export function resolveUpdateChannel(options: {
  packaged: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
}): UpdateChannel {
  if (!options.packaged) return 'disabled';
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  if (isWindows(platform)) return 'in-app';
  if (isLinux(platform) && isAppImage(env)) return 'in-app';
  if (isMac(platform)) return 'browser';
  if (isLinux(platform) && isDebInstall(execPath, env, platform)) return 'browser';
  if (isLinux(platform) || isMac(platform)) return 'browser';
  return 'disabled';
}

export function hotkeyFailureMessage(failedModes: string[], env: NodeJS.ProcessEnv = process.env): { title: string; body: string } {
  if (isWayland(env)) {
    return {
      title: 'ปุ่มลัดใช้ไม่ได้บน Wayland',
      body: 'GNOME/Wayland อาจบล็อก global hotkey (GNOME 50 ต้องใช้ Electron 44+) — ข้อความที่ถอดเสียงจะอยู่ใน clipboard ให้กด Ctrl+V เอง',
    };
  }
  return {
    title: 'ปุ่มลัดใช้งานไม่ได้',
    body: failedModes.length
      ? 'ปุ่มลัดอาจถูกแอปอื่นใช้อยู่ กรุณาเลือกปุ่มลัดใหม่ใน Settings'
      : 'ลงทะเบียนปุ่มลัดไม่สำเร็จ กรุณาเลือกปุ่มลัดใหม่ใน Settings',
  };
}

export function pasteFallbackMessage(reason: 'paste-failed' | 'injection-unavailable', env: NodeJS.ProcessEnv = process.env): { title: string; body: string } {
  if (reason === 'injection-unavailable' || isWayland(env)) {
    return {
      title: 'วางข้อความอัตโนมัติไม่ได้',
      body: isMac()
        ? 'ข้อความอยู่ใน clipboard แล้ว กด Cmd+V เพื่อวางเอง (ตรวจสิทธิ์ Accessibility หากยังวางอัตโนมัติไม่ได้)'
        : 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง (บน Wayland ติดตั้ง wtype หรือ ydotool เพื่อวางอัตโนมัติ)',
    };
  }
  return {
    title: 'วางข้อความไม่สำเร็จ',
    body: isMac()
      ? 'ข้อความอยู่ใน clipboard แล้ว กด Cmd+V เพื่อวางเอง'
      : 'ข้อความอยู่ใน clipboard แล้ว กด Ctrl+V เพื่อวางเอง',
  };
}
