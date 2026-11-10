import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  verifyFeedOwnerRepo,
  listMacApps,
} = require('./verify-update-artifacts.cjs') as {
  verifyFeedOwnerRepo: (config: { provider: string; owner: string; repo: string }, pkg: unknown) => void;
  listMacApps: (root: string) => string[];
};

const pkg = {
  build: {
    publish: { provider: 'github', owner: 'gotzastory', repo: 'OpenPood' },
  },
};

describe('verify-update-artifacts feed checks', () => {
  it('accepts gotzastory/OpenPood and rejects other repos', () => {
    expect(() => verifyFeedOwnerRepo({
      provider: 'github', owner: 'gotzastory', repo: 'OpenPood',
    }, pkg)).not.toThrow();
    expect(() => verifyFeedOwnerRepo({
      provider: 'github', owner: 'gotzastory', repo: 'OpenPud',
    }, pkg)).toThrow(/OpenPood/);
    expect(() => verifyFeedOwnerRepo({
      provider: 'github', owner: 'other', repo: 'OpenPood',
    }, pkg)).toThrow(/gotzastory/);
  });

  it('lists every .app under release/mac and release/mac-arm64', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpood-verify-'));
    try {
      fs.mkdirSync(path.join(root, 'mac', 'OpenPood.app', 'Contents', 'Resources'), { recursive: true });
      fs.mkdirSync(path.join(root, 'mac-arm64', 'OpenPood.app', 'Contents', 'Resources'), { recursive: true });
      const apps = listMacApps(root);
      expect(apps).toHaveLength(2);
      expect(apps.some((app) => app.includes(`${path.sep}mac${path.sep}`))).toBe(true);
      expect(apps.some((app) => app.includes('mac-arm64'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
