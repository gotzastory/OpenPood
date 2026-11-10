const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const asar = require('@electron/asar');

function fail(message) {
  throw new Error(message);
}

function verifyFiles(root, info, extensionPattern) {
  if (!Array.isArray(info.files) || info.files.length < 1) fail('Expected installer files in metadata');
  for (const item of info.files) {
    if (typeof item.url !== 'string' || !extensionPattern.test(item.url)) fail(`Unsafe installer filename: ${item.url}`);
    const file = path.join(root, item.url);
    const content = fs.readFileSync(file);
    if (content.length !== item.size) fail(`Installer size mismatch: ${item.url}`);
    if (crypto.createHash('sha512').update(content).digest('base64') !== item.sha512) fail(`Installer checksum mismatch: ${item.url}`);
    const blockmap = `${file}.blockmap`;
    if (fs.existsSync(blockmap) && fs.statSync(blockmap).size === 0) fail(`Empty installer blockmap: ${item.url}`);
  }
}

function verifyPackagedUpdater(root, pkg, unpackedDir) {
  const config = yaml.load(fs.readFileSync(path.join(root, unpackedDir, 'resources/app-update.yml'), 'utf8'));
  if (config.provider !== pkg.build.publish.provider || config.owner !== pkg.build.publish.owner || config.repo !== pkg.build.publish.repo) {
    fail('Packaged update feed mismatch');
  }
  const archive = path.join(root, unpackedDir, 'resources/app.asar');
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  if (packed.version !== pkg.version || !packed.dependencies['electron-updater']) fail('Packaged updater missing or wrong version');
  asar.extractFile(archive, path.join('node_modules', 'electron-updater', 'out', 'main.js'));
}

try {
  const root = path.resolve(process.argv[2] || 'release');
  const platform = process.argv[3] || 'win';
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined;
  if (tag && tag !== `v${pkg.version}`) fail('Tag and package version mismatch');

  if (platform === 'win') {
    const info = yaml.load(fs.readFileSync(path.join(root, 'latest.yml'), 'utf8'));
    if (info.version !== pkg.version) fail('Metadata version mismatch');
    if (!Array.isArray(info.files) || info.files.length !== 1) fail('Expected one installer in metadata');
    verifyFiles(root, info, /^[\w.-]+\.exe$/);
    verifyPackagedUpdater(root, pkg, 'win-unpacked');
    console.log(`Verified Windows v${pkg.version}: installer name, size, SHA-512, blockmap, packaged updater and feed`);
  } else if (platform === 'linux') {
    const info = yaml.load(fs.readFileSync(path.join(root, 'latest-linux.yml'), 'utf8'));
    if (info.version !== pkg.version) fail('Metadata version mismatch');
    verifyFiles(root, info, /^[\w.-]+\.(AppImage|deb)$/);
    const hasAppImage = fs.readdirSync(root).some((name) => name.endsWith('.AppImage'));
    const hasDeb = fs.readdirSync(root).some((name) => name.endsWith('.deb'));
    if (!hasAppImage || !hasDeb) fail('Expected both AppImage and deb artifacts');
    console.log(`Verified Linux v${pkg.version}: latest-linux.yml, AppImage, deb`);
  } else if (platform === 'mac') {
    const info = yaml.load(fs.readFileSync(path.join(root, 'latest-mac.yml'), 'utf8'));
    if (info.version !== pkg.version) fail('Metadata version mismatch');
    verifyFiles(root, info, /^[\w.-]+\.zip$/);
    const hasDmg = fs.readdirSync(root).some((name) => name.endsWith('.dmg'));
    const hasZip = fs.readdirSync(root).some((name) => name.endsWith('.zip'));
    if (!hasDmg || !hasZip) fail('Expected both dmg and zip artifacts');
    console.log(`Verified macOS v${pkg.version}: latest-mac.yml, dmg, zip`);
  } else {
    fail(`Unknown platform: ${platform}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Artifact verification failed');
  process.exitCode = 1;
}
