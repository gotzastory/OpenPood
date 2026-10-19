import { RUNTIME } from '../src/lib/runtimeConfig';

export class ProviderRequestError extends Error {}

function httpHint(status: number): string {
  if (status === 401 || status === 403) return 'ตรวจสอบ API key และสิทธิ์ใช้งาน';
  if (status === 429) return 'ตรวจสอบโควตาหรือรอสักครู่แล้วลองใหม่';
  if (status >= 500) return 'ผู้ให้บริการขัดข้อง ลองใหม่อีกครั้ง';
  return 'ตรวจสอบโมเดลและการตั้งค่าแล้วลองใหม่';
}

// The deadline covers headers AND the response body. Never expose server bodies,
// transport errors, URLs, credentials or user text through errors/logs.
export async function providerJson(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    combined.throwIfAborted();
    const response = await fetch(url, { ...init, signal: combined, redirect: 'error' });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new ProviderRequestError(`${label} error (${response.status}): ${httpHint(response.status)}`);
    }
    if (!response.body) throw new ProviderRequestError(`${label} ส่งผลลัพธ์ไม่ถูกต้อง — ลองใหม่อีกครั้ง`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const abortBody = () => { void reader.cancel().catch(() => undefined); };
    combined.addEventListener('abort', abortBody, { once: true });
    try {
      while (true) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        length += value.byteLength;
        if (length > RUNTIME.maxResponseBytes) {
          void reader.cancel().catch(() => undefined);
          throw new ProviderRequestError(`${label} ส่งผลลัพธ์ใหญ่เกินขีดจำกัด`);
        }
        chunks.push(value);
      }
    } finally {
      combined.removeEventListener('abort', abortBody);
      reader.releaseLock();
    }
    try {
      return JSON.parse(Buffer.concat(chunks, length).toString('utf8')) as unknown;
    } catch {
      throw new ProviderRequestError(`${label} ส่งผลลัพธ์ไม่ถูกต้อง — ลองใหม่อีกครั้ง`);
    }
  } catch (error) {
    if (signal?.aborted) throw new ProviderRequestError('ยกเลิกการทำงานแล้ว');
    if (deadline.aborted) throw new ProviderRequestError(`${label} หมดเวลา — ลองใหม่อีกครั้ง`);
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(`เชื่อมต่อ ${label} ไม่สำเร็จ — ตรวจสอบเครือข่ายแล้วลองใหม่`);
  }
}

export function responseText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > RUNTIME.maxTextChars) {
    throw new ProviderRequestError(`${label} ส่งผลลัพธ์ไม่ถูกต้องหรือยาวเกินขีดจำกัด`);
  }
  return value.trim();
}
