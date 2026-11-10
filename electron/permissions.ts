import { systemPreferences } from 'electron';
import { isMac } from './platform';

export interface PermissionSnapshot {
  microphone: 'granted' | 'denied' | 'restricted' | 'unknown' | 'not-determined' | 'unsupported';
  accessibility: boolean | 'unsupported';
}

export async function requestMacPermissions(): Promise<PermissionSnapshot> {
  if (!isMac()) {
    return { microphone: 'unsupported', accessibility: 'unsupported' };
  }

  let microphone: PermissionSnapshot['microphone'] = 'unknown';
  try {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    microphone = granted ? 'granted' : 'denied';
  } catch {
    try {
      microphone = systemPreferences.getMediaAccessStatus('microphone') as PermissionSnapshot['microphone'];
    } catch {
      microphone = 'unknown';
    }
  }

  // Passing true prompts the user to open System Settings when needed.
  let accessibility: boolean | 'unsupported' = false;
  try {
    accessibility = systemPreferences.isTrustedAccessibilityClient(true);
  } catch {
    accessibility = false;
  }

  return { microphone, accessibility };
}

export function notifyMissingMacPermissions(
  notify: (title: string, body: string) => void,
  snapshot: PermissionSnapshot,
): void {
  if (snapshot.microphone === 'denied' || snapshot.microphone === 'restricted') {
    notify(
      'ต้องการสิทธิ์ไมโครโฟน',
      'เปิด System Settings → Privacy & Security → Microphone แล้วอนุญาต OpenPood',
    );
  }
  if (snapshot.accessibility === false) {
    notify(
      'ต้องการสิทธิ์ Accessibility',
      'เปิด System Settings → Privacy & Security → Accessibility แล้วอนุญาต OpenPood เพื่อวางข้อความด้วย Cmd+V',
    );
  }
}
