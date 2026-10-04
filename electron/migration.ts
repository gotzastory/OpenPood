import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const LEGACY_STORE_FILES = ['config.json', 'history.json', 'dictionary.json'] as const;
const MIGRATION_MARKER = '.openpood-migration-v1';

/** Copy only known stores, retain source bytes (including the encrypted key), never overwrite new data. */
export function migrateLegacyData(legacyDirectory: string, targetDirectory: string): number {
  if (path.resolve(legacyDirectory).toLowerCase() === path.resolve(targetDirectory).toLowerCase()) return 0;
  if (existsSync(path.join(targetDirectory, MIGRATION_MARKER))) return 0;

  const pending = LEGACY_STORE_FILES.filter((file) =>
    existsSync(path.join(legacyDirectory, file)) && !existsSync(path.join(targetDirectory, file)),
  );
  // Validate everything first. Invalid legacy JSON must not silently become a fresh install.
  for (const file of pending) {
    const value: unknown = JSON.parse(readFileSync(path.join(legacyDirectory, file), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Cannot migrate ${file}: invalid store. Original data was retained.`);
    }
  }
  if (!LEGACY_STORE_FILES.some((file) => existsSync(path.join(legacyDirectory, file)))) return 0;

  mkdirSync(targetDirectory, { recursive: true });
  const copied: string[] = [];
  const temporaryMarker = path.join(targetDirectory, `${MIGRATION_MARKER}.tmp`);
  try {
    for (const file of pending) {
      const destination = path.join(targetDirectory, file);
      copyFileSync(path.join(legacyDirectory, file), destination, constants.COPYFILE_EXCL);
      copied.push(destination);
    }
    writeFileSync(temporaryMarker, 'OpenPud -> OpenPood\n', { flag: 'wx' });
    renameSync(temporaryMarker, path.join(targetDirectory, MIGRATION_MARKER));
    return copied.length;
  } catch (error) {
    for (const file of copied) rmSync(file, { force: true });
    rmSync(temporaryMarker, { force: true });
    throw error;
  }
}
