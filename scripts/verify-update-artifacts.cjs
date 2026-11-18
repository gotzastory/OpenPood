const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const asar = require('@electron/asar');

function fail(message) {
  throw new Error(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Reject path traversal, separators, spaces, and shell metacharacters. */
function isSafeArtifactBasename(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name !== path.basename(name)) return false;
  if (name.includes('..')) return false;
  // Allow letters, digits, dot, underscore, hyphen only (matches electron-builder artifact names).
  return /^[\w.-]+$/.test(name);
}

function productName(pkg) {
  return pkg.build?.productName || pkg.productName || pkg.name;
}

/** Expected Windows NSIS name from build.nsis.artifactName. */
function expectedWinExeName(pkg) {
  const template = pkg.build?.nsis?.artifactName || '${productName}-Setup-${version}.${ext}';
  return template
    .replaceAll('${productName}', productName(pkg))
    .replaceAll('${version}', pkg.version)
    .replaceAll('${ext}', 'exe');
}

/**
 * Expected Linux names from build.linux.artifactName.
 * electron-builder uses x86_64 for AppImage and amd64 for deb on x64 hosts.
 */
function expectedLinuxArtifactNames(pkg) {
  const template = pkg.build?.linux?.artifactName || '${productName}-${version}-${arch}.${ext}';
  const render = (arch, ext) => template
    .replaceAll('${productName}', productName(pkg))
    .replaceAll('${version}', pkg.version)
    .replaceAll('${arch}', arch)
    .replaceAll('${ext}', ext);
  return {
    appImage: render('x86_64', 'AppImage'),
    deb: render('amd64', 'deb'),
  };
}

/** Expected mac dmg/zip names from build.mac.artifactName for x64 and arm64. */
function expectedMacArtifactNames(pkg) {
  const template = pkg.build?.mac?.artifactName || '${productName}-${version}-${arch}.${ext}';
  const render = (arch, ext) => template
    .replaceAll('${productName}', productName(pkg))
    .replaceAll('${version}', pkg.version)
    .replaceAll('${arch}', arch)
    .replaceAll('${ext}', ext);
  return {
    x64Zip: render('x64', 'zip'),
    arm64Zip: render('arm64', 'zip'),
    x64Dmg: render('x64', 'dmg'),
    arm64Dmg: render('arm64', 'dmg'),
  };
}

function winFilenamePattern(pkg) {
  return new RegExp(`^${escapeRegExp(expectedWinExeName(pkg))}$`);
}

function linuxFilenamePattern(pkg) {
  const { appImage, deb } = expectedLinuxArtifactNames(pkg);
  return new RegExp(`^(?:${escapeRegExp(appImage)}|${escapeRegExp(deb)})$`);
}

function macFilenamePattern(pkg) {
  const names = expectedMacArtifactNames(pkg);
  const allowed = [names.x64Zip, names.arm64Zip, names.x64Dmg, names.arm64Dmg].map(escapeRegExp);
  return new RegExp(`^(?:${allowed.join('|')})$`);
}

function assertSafeAndAllowed(name, pattern) {
  if (!isSafeArtifactBasename(name)) fail(`Unsafe installer filename: ${name}`);
  if (!pattern.test(name)) fail(`Unsafe installer filename: ${name}`);
}

/**
 * Every `files[].url` in the update metadata must exist under root, match the
 * platform allowlist, and satisfy size/sha512 (and non-empty blockmap when present).
 */
function verifyFiles(root, info, pattern) {
  if (!Array.isArray(info.files) || info.files.length < 1) fail('Expected installer files in metadata');
  for (const item of info.files) {
    if (typeof item.url !== 'string') fail(`Unsafe installer filename: ${item.url}`);
    assertSafeAndAllowed(item.url, pattern);
    const file = path.join(root, item.url);
    if (!fs.existsSync(file)) fail(`Missing artifact referenced by metadata: ${item.url}`);
    const content = fs.readFileSync(file);
    if (content.length !== item.size) fail(`Installer size mismatch: ${item.url}`);
    if (crypto.createHash('sha512').update(content).digest('base64') !== item.sha512) {
      fail(`Installer checksum mismatch: ${item.url}`);
    }
    const blockmap = `${file}.blockmap`;
    if (fs.existsSync(blockmap) && fs.statSync(blockmap).size === 0) fail(`Empty installer blockmap: ${item.url}`);
  }
}

/** latest-mac.yml must list zip artifacts for both x64 and arm64 so both arches can auto-update. */
function requireMacZipArches(info, pkg) {
  const { x64Zip, arm64Zip } = expectedMacArtifactNames(pkg);
  const urls = Array.isArray(info.files) ? info.files.map((item) => item.url) : [];
  if (!urls.includes(x64Zip)) fail(`latest-mac.yml missing x64 zip: expected ${x64Zip}`);
  if (!urls.includes(arm64Zip)) fail(`latest-mac.yml missing arm64 zip: expected ${arm64Zip}`);
}

function verifyFeedOwnerRepo(config, pkg) {
  const expected = pkg.build.publish;
  if (
    config.provider !== expected.provider
    || config.owner !== expected.owner
    || config.repo !== expected.repo
    || config.owner !== 'gotzastory'
    || config.repo !== 'OpenPood'
  ) {
    fail(`Packaged update feed mismatch: expected gotzastory/OpenPood, got ${config.owner}/${config.repo}`);
  }
}

function verifyPackagedUpdater(root, pkg, unpackedDir) {
  const updateYml = path.join(root, unpackedDir, 'resources/app-update.yml');
  const config = yaml.load(fs.readFileSync(updateYml, 'utf8'));
  verifyFeedOwnerRepo(config, pkg);
  const archive = path.join(root, unpackedDir, 'resources/app.asar');
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  if (packed.version !== pkg.version || !packed.dependencies['electron-updater']) fail('Packaged updater missing or wrong version');
  asar.extractFile(archive, path.join('node_modules', 'electron-updater', 'out', 'main.js'));
}

function listMacApps(root) {
  const apps = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name.endsWith('.app')) apps.push(full);
      else if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return apps.sort();
}

function verifyMacAppUpdateFeeds(root, pkg) {
  const apps = listMacApps(root);
  if (apps.length === 0) fail('Expected at least one .app under release/');
  for (const appPath of apps) {
    const updateYml = path.join(appPath, 'Contents/Resources/app-update.yml');
    if (!fs.existsSync(updateYml)) fail(`Missing app-update.yml in ${appPath}`);
    const config = yaml.load(fs.readFileSync(updateYml, 'utf8'));
    verifyFeedOwnerRepo(config, pkg);
  }
  return apps.length;
}

function verifyLinux(root, pkg) {
  const info = yaml.load(fs.readFileSync(path.join(root, 'latest-linux.yml'), 'utf8'));
  if (info.version !== pkg.version) fail('Metadata version mismatch');
  verifyFiles(root, info, linuxFilenamePattern(pkg));
  const expected = expectedLinuxArtifactNames(pkg);
  const names = new Set(fs.readdirSync(root));
  if (!names.has(expected.appImage) || !names.has(expected.deb)) {
    fail(`Expected both ${expected.appImage} and ${expected.deb}`);
  }
  verifyPackagedUpdater(root, pkg, 'linux-unpacked');
}

function verifyMac(root, pkg) {
  const info = yaml.load(fs.readFileSync(path.join(root, 'latest-mac.yml'), 'utf8'));
  if (info.version !== pkg.version) fail('Metadata version mismatch');
  requireMacZipArches(info, pkg);
  verifyFiles(root, info, macFilenamePattern(pkg));
  const expected = expectedMacArtifactNames(pkg);
  const names = new Set(fs.readdirSync(root));
  for (const required of [expected.x64Dmg, expected.arm64Dmg, expected.x64Zip, expected.arm64Zip]) {
    if (!names.has(required)) fail(`Missing mac artifact on disk: ${required}`);
  }
  verifyMacAppUpdateFeeds(root, pkg);
}

function verifyWin(root, pkg) {
  const info = yaml.load(fs.readFileSync(path.join(root, 'latest.yml'), 'utf8'));
  if (info.version !== pkg.version) fail('Metadata version mismatch');
  if (!Array.isArray(info.files) || info.files.length !== 1) fail('Expected one installer in metadata');
  verifyFiles(root, info, winFilenamePattern(pkg));
  verifyPackagedUpdater(root, pkg, 'win-unpacked');
}

function main(argv = process.argv, env = process.env) {
  const root = path.resolve(argv[2] || 'release');
  const platform = argv[3] || 'win';
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const tag = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : undefined;
  if (tag && tag !== `v${pkg.version}`) fail('Tag and package version mismatch');

  if (platform === 'win') {
    verifyWin(root, pkg);
    console.log(`Verified Windows v${pkg.version}: installer name, size, SHA-512, blockmap, packaged updater and feed`);
  } else if (platform === 'linux') {
    verifyLinux(root, pkg);
    console.log(`Verified Linux v${pkg.version}: latest-linux.yml, AppImage, deb, linux-unpacked app-update.yml`);
  } else if (platform === 'mac') {
    verifyMac(root, pkg);
    console.log(`Verified macOS v${pkg.version}: latest-mac.yml, dmg, zip (x64+arm64), per-app app-update.yml`);
  } else {
    fail(`Unknown platform: ${platform}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Artifact verification failed');
    process.exitCode = 1;
  }
}

module.exports = {
  verifyFeedOwnerRepo,
  listMacApps,
  verifyMacAppUpdateFeeds,
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
  verifyMac,
  main,
};
