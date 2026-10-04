import { useEffect, useState } from 'react';
import type { UpdatePhase, UpdateStatus } from '../lib/updateTypes';
import { BTN } from '../lib/uiClasses';

const LABELS: Record<UpdatePhase, string> = {
  disabled: 'อัปเดตได้จากแอปที่ติดตั้งบน Windows เท่านั้น',
  idle: 'เช็กเวอร์ชันใหม่อัตโนมัติเมื่อเปิดแอป และทุก 6 ชั่วโมง',
  checking: 'กำลังเช็กเวอร์ชันใหม่…',
  current: 'คุณใช้เวอร์ชันล่าสุดแล้ว',
  available: 'มีเวอร์ชันใหม่พร้อมดาวน์โหลด',
  downloading: 'กำลังดาวน์โหลด… ใช้แอปต่อได้',
  downloaded: 'ดาวน์โหลดแล้ว พร้อมติดตั้งเมื่อคุณสะดวก',
  installing: 'กำลังเปิดตัวติดตั้ง แอปจะปิดและเปิดใหม่…',
  error: 'เช็กหรือดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง',
};

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [bridgeError, setBridgeError] = useState('');

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.typeless.onUpdateStatus((next) => {
      receivedEvent = true;
      if (active) setStatus(next);
    });
    void window.typeless.getUpdateStatus().then((next) => {
      if (active && !receivedEvent) setStatus(next);
    }).catch(() => { if (active) setBridgeError('โหลดข้อมูลอัปเดตไม่สำเร็จ เปิดหน้านี้ใหม่เพื่อลองอีกครั้ง'); });
    return () => { active = false; unsubscribe(); };
  }, []);

  const run = async (action: () => Promise<UpdateStatus>) => {
    setPending(true);
    setBridgeError('');
    try { setStatus(await action()); }
    catch { setBridgeError('ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { setPending(false); }
  };
  const working = pending || status?.phase === 'checking' || status?.phase === 'downloading' || status?.phase === 'installing';

  return (
    <section className="card card-border mt-5 bg-base-100" aria-labelledby="updates-title">
      <div className="card-body gap-3 p-6">
        <h2 id="updates-title" className="text-base font-semibold">อัปเดต OpenPood</h2>
        <p className="text-sm text-base-content/65">
          {status ? `เวอร์ชันปัจจุบัน ${status.currentVersion}${status.version ? ` → ${status.version}` : ''}` : 'กำลังโหลด…'}
        </p>
        <p role="status" aria-live="polite" className="text-sm">{status && LABELS[status.phase]}</p>
        {status?.phase === 'downloading' && (
          <div>
            <progress className="progress w-full" max={100} value={status.percent ?? 0} aria-label="ความคืบหน้าดาวน์โหลด" />
            <p className="mt-1 text-xs text-base-content/65">{Math.round(status.percent ?? 0)}%</p>
          </div>
        )}
        {status?.releaseNotes && <details className="text-sm"><summary className="cursor-pointer">มีอะไรใหม่</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-base-content/65">{status.releaseNotes}</pre></details>}
        {(bridgeError || status?.error) && <p role="alert" className="text-sm text-error">{bridgeError || status?.error}</p>}
        {status?.busy && status.phase === 'downloaded' && <p className="text-sm text-base-content/65">รอให้การอัดเสียง ถอดเสียง และวางข้อความเสร็จก่อนติดตั้ง</p>}
        {status && status.phase !== 'disabled' && (
          <div className="flex flex-wrap gap-2">
            {status.phase !== 'downloaded' && status.phase !== 'installing' && <button type="button" className={BTN} disabled={working} onClick={() => void run(() => window.typeless.checkForUpdates())}>เช็กอัปเดต</button>}
            {(status.phase === 'available' || (status.phase === 'error' && status.version)) && <button type="button" className={BTN} disabled={working} onClick={() => void run(() => window.typeless.downloadUpdate())}>{status.phase === 'error' ? 'ดาวน์โหลดอีกครั้ง' : 'ดาวน์โหลดอัปเดต'}</button>}
            {status.phase === 'downloaded' && <button type="button" className={BTN} disabled={working || status.busy} onClick={() => void run(() => window.typeless.installUpdate())}>Restart &amp; Update</button>}
          </div>
        )}
        <p className="text-xs text-base-content/65">คุณเลือกเวลาดาวน์โหลดและติดตั้งได้ ปิดหน้านี้เพื่อไว้ภายหลัง</p>
      </div>
    </section>
  );
}
