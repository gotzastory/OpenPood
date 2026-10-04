import { app, dialog } from 'electron';
import path from 'node:path';
import { migrateLegacyData } from './migration';

// Runs before any electron-store constructor, including during static module loading.
function initializeStorage(): string {
  app.setName('OpenPood');
  const directory = path.join(app.getPath('appData'), 'OpenPood');
  try {
    app.setPath('userData', directory);
    // Serialize migration and store writes across repeated launches.
    if (!app.requestSingleInstanceLock()) {
      app.exit(0);
      return directory;
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
