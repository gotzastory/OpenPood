const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const asar = require('@electron/asar');

try {
  const root = path.resolve(process.argv[2] || 'release');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const info = yaml.load(fs.readFileSync(path.join(root, 'latest.yml'), 'utf8'));
  if (info.version !== pkg.version) throw new Error('Metadata version mismatch');
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined;
  if (tag && tag !== `v${pkg.version}`) throw new Error('Tag and package version mismatch');
  if (!Array.isArray(info.files) || info.files.length !== 1) throw new Error('Expected one installer in metadata');
  for (const item of info.files) {
    if (typeof item.url !== 'string' || !/^[\w.-]+\.exe$/.test(item.url)) throw new Error('Unsafe installer filename');
    const file = path.join(root, item.url);
    const content = fs.readFileSync(file);
    if (content.length !== item.size) throw new Error('Installer size mismatch');
    if (crypto.createHash('sha512').update(content).digest('base64') !== item.sha512) throw new Error('Installer checksum mismatch');
    if (fs.statSync(`${file}.blockmap`).size === 0) throw new Error('Empty installer blockmap');
  }
  const config = yaml.load(fs.readFileSync(path.join(root, 'win-unpacked/resources/app-update.yml'), 'utf8'));
  if (config.provider !== pkg.build.publish.provider || config.owner !== pkg.build.publish.owner || config.repo !== pkg.build.publish.repo) throw new Error('Packaged update feed mismatch');
  const archive = path.join(root, 'win-unpacked/resources/app.asar');
  const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  if (packed.version !== pkg.version || !packed.dependencies['electron-updater']) throw new Error('Packaged updater missing or wrong version');
  asar.extractFile(archive, path.join('node_modules', 'electron-updater', 'out', 'main.js'));
  console.log(`Verified v${pkg.version}: installer name, size, SHA-512, blockmap, packaged updater and feed`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Artifact verification failed');
  process.exitCode = 1;
}
