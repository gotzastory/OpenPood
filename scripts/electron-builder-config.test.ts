import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as {
  desktopName?: string;
  build: Record<string, unknown> & {
    linux?: { syncDesktopName?: boolean; desktop?: { entry?: Record<string, string> } };
  };
};

describe('electron-builder packaging config', () => {
  it('keeps desktopName in package metadata and a valid linux.desktop.entry shape', async () => {
    expect(pkg.desktopName).toBe('com.openpood.app.desktop');
    expect(pkg.build).not.toHaveProperty('desktopName');
    expect(pkg.build.linux?.syncDesktopName).toBe(true);
    expect(pkg.build.linux?.desktop?.entry?.Name).toBe('OpenPood');
    expect(pkg.build.linux?.desktop?.entry?.StartupWMClass).toBe('com.openpood.app');

    const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js') as {
      validateConfiguration: (config: unknown) => Promise<void>;
    };
    await expect(validateConfiguration({ ...pkg.build })).resolves.toBeUndefined();
  });
});
