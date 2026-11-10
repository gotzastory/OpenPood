export type UpdateFailureKind = 'no-feed' | 'network';

/**
 * Distinguish a missing platform update feed (e.g. 404 on latest-linux.yml)
 * from generic connectivity failures so the UI does not blame the internet.
 */
export function classifyUpdateFailure(error: unknown): UpdateFailureKind {
  const message = error instanceof Error
    ? `${error.message}\n${error.stack ?? ''}`
    : String(error ?? '');
  const lower = message.toLowerCase();
  const mentionsLatestFeed = lower.includes('latest-linux.yml')
    || lower.includes('latest-mac.yml')
    || lower.includes('latest.yml')
    || lower.includes('cannot find latest')
    || lower.includes('no published versions');
  const is404 = /\b404\b/.test(message)
    || lower.includes('status code 404')
    || (lower.includes('httperror') && lower.includes('404'));
  if (is404 || mentionsLatestFeed) return 'no-feed';
  return 'network';
}

export const UPDATE_NO_FEED_MESSAGE = 'ยังไม่มีไฟล์อัปเดตสำหรับแพลตฟอร์มนี้ — จะใช้ได้เมื่อมี release ที่เผยแพร่ update feed';
export const UPDATE_NETWORK_MESSAGE = 'อัปเดตไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
