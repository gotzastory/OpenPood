import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const realPkg = require('../package.json') as {
  version: string;
  name: string;
  build: {
    productName: string;
    publish: { provider: string; owner: string; repo: string };
    nsis: { artifactName: string };
    mac: { artifactName: string };
    linux: { artifactName: string };
  };
};

const {
  verifyFeedOwnerRepo,
  listMacApps,
  isSafeArtifactBasename,
  expectedWinExeName,
  expectedLinuxArtifactNames,
  expectedMacArtifactNames,
  winFilenamePattern,
  linuxFilenamePattern,
  macFilenamePattern,
  assertSafeAndAllowed,
  requireMacZipArches,
  verifyFiles,
} = require('./verify-update-artifacts.cjs') as {
  verifyFeedOwnerRepo: (config: { provider: string; owner: string; repo: string }, pkg: unknown) => void;
  listMacApps: (root: string) => string[];
  isSafeArtifactBasename: (name: string) => boolean;
  expectedWinExeName: (pkg: typeof realPkg) => string;
  expectedLinuxArtifactNames: (pkg: typeof realPkg) => { appImage: string; deb: string };
  expectedMacArtifactNames: (pkg: typeof realPkg) => {
    x64Zip: string; arm64Zip: string; x64Dmg: string; arm64Dmg: string;
  };
  winFilenamePattern: (pkg: typeof realPkg) => RegExp;
  linuxFilenamePattern: (pkg: typeof realPkg) => RegExp;
  macFilenamePattern: (pkg: typeof realPkg) => RegExp;
  assertSafeAndAllowed: (name: string, pattern: RegExp) => void;
  requireMacZipArches: (info: { files: Array<{ url: string }> }, pkg: typeof realPkg) => void;
  verifyFiles: (root: string, info: { files: Array<{ url: string; size: number; sha512: string }> }, pattern: RegExp) => void;
};

const feedPkg = {
  build: {
    publish: { provider: 'github', owner: 'gotzastory', repo: 'OpenPood' },
  },
};

function sha512Base64(content: Buffer): string {
  return crypto.createHash('sha512').update(content).digest('base64');
}

describe('verify-update-artifacts feed checks', () => {
  it('accepts gotzastory/OpenPood and rejects other repos', () => {
    expect(() => verifyFeedOwnerRepo({
      provider: 'github', owner: 'gotzastory', repo: 'OpenPood',
    }, feedPkg)).not.toThrow();
    expect(() => verifyFeedOwnerRepo({
      provider: 'github', owner: 'gotzastory', repo: 'OpenPud',
    }, feedPkg)).toThrow(/OpenPood/);
    expect(() => verifyFeedOwnerRepo({
      provider: 'github', owner: 'other', repo: 'OpenPood',
    }, feedPkg)).toThrow(/gotzastory/);
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

describe('artifact filename allowlists (from package.json artifactName)', () => {
  const win = expectedWinExeName(realPkg);
  const linux = expectedLinuxArtifactNames(realPkg);
  const mac = expectedMacArtifactNames(realPkg);

  const accepted = [
    win,
    `${win}.blockmap`,
    linux.appImage,
    linux.deb,
    mac.x64Dmg,
    mac.arm64Dmg,
    mac.x64Zip,
    mac.arm64Zip,
    `${mac.x64Zip}.blockmap`,
    `${mac.arm64Zip}.blockmap`,
  ];

  const rejected = [
    '../OpenPood-1.0.3-x64.zip',
    'OpenPood/1.0.3-x64.zip',
    'OpenPood 1.0.3-x64.zip',
    'OpenPood-1.0.3-x64.zip;rm',
    'OpenPood-9.9.9-x64.zip',
    'NotOpenPood-1.0.3-x64.zip',
    'OpenPood-1.0.3-x64.tar.gz',
    'OpenPood-1.0.3-universal.zip',
    'evil.exe',
  ];

  it('derives expected names from electron-builder artifactName templates', () => {
    expect(win).toBe(`OpenPood-Setup-${realPkg.version}.exe`);
    expect(linux.appImage).toBe(`OpenPood-${realPkg.version}-x86_64.AppImage`);
    expect(linux.deb).toBe(`OpenPood-${realPkg.version}-amd64.deb`);
    expect(mac.x64Zip).toBe(`OpenPood-${realPkg.version}-x64.zip`);
    expect(mac.arm64Zip).toBe(`OpenPood-${realPkg.version}-arm64.zip`);
    expect(mac.x64Dmg).toBe(`OpenPood-${realPkg.version}-x64.dmg`);
    expect(mac.arm64Dmg).toBe(`OpenPood-${realPkg.version}-arm64.dmg`);
  });

  it('accepts real win/linux/mac artifact basenames', () => {
    // Expose for the task report.
    console.log('ACCEPTED_NAMES', JSON.stringify(accepted));
    expect(isSafeArtifactBasename(win)).toBe(true);
    expect(winFilenamePattern(realPkg).test(win)).toBe(true);
    expect(linuxFilenamePattern(realPkg).test(linux.appImage)).toBe(true);
    expect(linuxFilenamePattern(realPkg).test(linux.deb)).toBe(true);
    for (const name of [mac.x64Dmg, mac.arm64Dmg, mac.x64Zip, mac.arm64Zip]) {
      expect(() => assertSafeAndAllowed(name, macFilenamePattern(realPkg))).not.toThrow();
    }
  });

  it('rejects path traversal, spaces, metacharacters, wrong product/version, unexpected extensions', () => {
    console.log('REJECTED_NAMES', JSON.stringify(rejected));
    for (const name of rejected) {
      const safe = isSafeArtifactBasename(name);
      const allowed = macFilenamePattern(realPkg).test(name)
        || winFilenamePattern(realPkg).test(name)
        || linuxFilenamePattern(realPkg).test(name);
      expect(safe && allowed).toBe(false);
      expect(() => assertSafeAndAllowed(name, macFilenamePattern(realPkg))).toThrow(/Unsafe installer filename/);
    }
  });
});

describe('latest-mac.yml must list zip for both x64 and arm64', () => {
  const mac = expectedMacArtifactNames(realPkg);

  it('passes when both x64 and arm64 zips are listed', () => {
    expect(() => requireMacZipArches({
      files: [{ url: mac.x64Zip }, { url: mac.arm64Zip }, { url: mac.x64Dmg }],
    }, realPkg)).not.toThrow();
  });

  it('fails when the x64 zip is missing', () => {
    expect(() => requireMacZipArches({
      files: [{ url: mac.arm64Zip }, { url: mac.arm64Dmg }],
    }, realPkg)).toThrow(/missing x64 zip/);
  });

  it('fails when the arm64 zip is missing', () => {
    expect(() => requireMacZipArches({
      files: [{ url: mac.x64Zip }, { url: mac.x64Dmg }],
    }, realPkg)).toThrow(/missing arm64 zip/);
  });
});

describe('metadata file references must exist on disk', () => {
  it('fails when a latest-*.yml url is missing under release/', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpood-meta-'));
    try {
      const name = expectedMacArtifactNames(realPkg).x64Zip;
      const content = Buffer.from('zip-bytes');
      // Intentionally do not write the file.
      expect(() => verifyFiles(root, {
        files: [{ url: name, size: content.length, sha512: sha512Base64(content) }],
      }, macFilenamePattern(realPkg))).toThrow(/Missing artifact referenced by metadata/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes when every referenced file exists with matching size and sha512', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpood-meta-ok-'));
    try {
      const name = expectedWinExeName(realPkg);
      const content = Buffer.from('nsis-installer');
      fs.writeFileSync(path.join(root, name), content);
      expect(() => verifyFiles(root, {
        files: [{ url: name, size: content.length, sha512: sha512Base64(content) }],
      }, winFilenamePattern(realPkg))).not.toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
