import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as {
  desktopName?: string;
  author?: string | { name?: string; email?: string };
  build: Record<string, unknown> & {
    linux?: {
      syncDesktopName?: boolean;
      desktop?: { entry?: Record<string, string>; Name?: string };
    };
  };
};

describe('electron-builder packaging config', () => {
  it('matches electron-builder 26.18.1 scheme.json + metadata rules for desktopName', async () => {
    const schemePath = path.join(path.dirname(require.resolve('app-builder-lib/package.json')), 'scheme.json');
    // Root of scheme.json IS the Configuration object (no definitions.Configuration).
    const scheme = JSON.parse(fs.readFileSync(schemePath, 'utf8')) as {
      properties: Record<string, unknown>;
      definitions: {
        LinuxConfiguration: { properties: Record<string, unknown> };
        LinuxDesktopFile: { properties: Record<string, unknown> };
      };
    };

    // desktopName is package.json metadata (Electron + LinuxTargetHelper), not a build Configuration key.
    expect(scheme.properties).not.toHaveProperty('desktopName');
    expect(pkg.desktopName).toBe('com.openpood.app.desktop');
    expect(pkg.build).not.toHaveProperty('desktopName');

    // syncDesktopName is the LinuxConfiguration switch that derives the .desktop basename.
    expect(scheme.definitions.LinuxConfiguration.properties).toHaveProperty('syncDesktopName');
    expect(pkg.build.linux?.syncDesktopName).toBe(true);

    // linux.desktop must be LinuxDesktopFile { entry, desktopActions } — not a flat Name/Comment map.
    expect(Object.keys(scheme.definitions.LinuxDesktopFile.properties).sort()).toEqual(['desktopActions', 'entry']);
    expect(pkg.build.linux?.desktop).not.toHaveProperty('Name');
    expect(pkg.build.linux?.desktop?.entry?.Name).toBe('OpenPood');
    expect(pkg.build.linux?.desktop?.entry?.StartupWMClass).toBe('com.openpood.app');

    // Same basename logic as LinuxTargetHelper.getDesktopFileName().
    const desktopBasename = String(pkg.desktopName).replace(/\.desktop$/, '');
    expect(desktopBasename).toBe('com.openpood.app');
    expect(`${desktopBasename}.desktop`).toBe(pkg.desktopName);

    const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js') as {
      validateConfiguration: (config: unknown) => Promise<void>;
    };
    await expect(validateConfiguration({ ...pkg.build })).resolves.toBeUndefined();

    // deb/fpm requires author.email for the Maintainer field.
    expect(pkg.author && typeof pkg.author === 'object' ? pkg.author.email : '').toMatch(/@/);
  });

  it('keeps electron-builder 26 default deb depends and adds x11-utils', () => {
    const deb = (pkg.build as { deb?: { depends?: string[] } }).deb;
    // app-builder-lib FpmTarget.getDefaultDepends('deb') for 26.18.1, plus x11-utils.
    expect(deb?.depends).toEqual([
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
      'x11-utils',
    ]);
  });
});
