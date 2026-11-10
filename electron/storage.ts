import { app, dialog } from 'electron';
import path from 'node:path';
import { migrateLegacyData } from './migration';
import { shouldExitLosingInstance } from './windowLifecycle';

/** False when this process lost the single-instance lock and should not continue startup. */
export let ownsSingleInstanceLock = true;

// Runs before any electron-store constructor, including during static module loading.
function initializeStorage(): string {
  app.setName('OpenPood');
  // userData must be set before the lock so AppImage and /opt installs share one lock.
  const directory = path.join(app.getPath('appData'), 'OpenPood');
  try {
    app.setPath('userData', directory);
    // Serialize migration and store writes across repeated launches.
    const gotLock = app.requestSingleInstanceLock();
    ownsSingleInstanceLock = gotLock;
    if (shouldExitLosingInstance(gotLock)) {
      // Exit hard so AppImage/FUSE wrappers cannot continue loading main/tray.
      // The first instance receives `second-instance` and should show the dashboard.
      app.exit(0);
      process.exit(0);
    }
    migrateLegacyData(path.join(app.getPath('appData'), 'OpenPud'), directory);
    return directory;
  } catch {
    dialog.showErrorBox('OpenPood: ย้ายข้อมูลไม่สำเร็จ',
      'ข้อมูล OpenPud เดิมยังอยู่ครบ กรุณาตรวจสอบสิทธิ์และไฟล์ config.json, history.json, dictionary.json ก่อนเปิดแอปอีกครั้ง');
    app.exit(1);
    throw new Error('OpenPood storage initialization failed; legacy data retained.');
  }
}

export const STORE_DIRECTORY = initializeStorage();
