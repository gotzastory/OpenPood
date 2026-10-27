import type { AppSettings } from './config';
import { providerJson, ProviderRequestError } from './providerRequest';
import { RUNTIME } from '../src/lib/runtimeConfig';

export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/** Amounts are OpenRouter credits (1 credit = 1 USD). */
export interface OpenRouterUsage {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
  /** Key spending limit left, or null when the key has no limit. */
  keyLimitRemaining: number | null;
  /** Account balance, or null when /credits is not allowed for this key. */
  balance: number | null;
}

export type UsageResult =
  | { ok: true; usage: OpenRouterUsage }
  | { ok: false; error: string };

export function isOpenRouterProvider(settings: Pick<AppSettings, 'apiBaseUrl'>): boolean {
  return settings.apiBaseUrl.replace(/\/$/, '') === OPENROUTER_API_BASE;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function getOpenRouterUsage(settings: AppSettings): Promise<UsageResult> {
  if (!isOpenRouterProvider(settings)) return { ok: false, error: 'ดู usage ได้เฉพาะผู้ให้บริการ OpenRouter' };
  if (!settings.apiKey) return { ok: false, error: 'ยังไม่ได้ตั้งค่า API key ในหน้า Settings' };
  const init = { headers: { Authorization: `Bearer ${settings.apiKey}` } };
  const label = 'OpenRouter usage API';
  // /credits may require a management key; the account balance is optional.
  const [key, credits] = await Promise.allSettled([
    providerJson(`${OPENROUTER_API_BASE}/key`, init, label, RUNTIME.chatTimeoutMs),
    providerJson(`${OPENROUTER_API_BASE}/credits`, init, label, RUNTIME.chatTimeoutMs),
  ]);
  if (key.status === 'rejected') {
    return { ok: false, error: key.reason instanceof ProviderRequestError ? key.reason.message : 'โหลด usage ไม่สำเร็จ' };
  }
  const data = (key.value as { data?: Record<string, unknown> } | null)?.data;
  const total = num(data?.usage);
  if (!data || total === null) return { ok: false, error: `${label} ส่งผลลัพธ์ไม่ถูกต้อง — ลองใหม่อีกครั้ง` };
  const account = credits.status === 'fulfilled'
    ? (credits.value as { data?: Record<string, unknown> } | null)?.data
    : undefined;
  const purchased = num(account?.total_credits);
  const used = num(account?.total_usage);
  return {
    ok: true,
    usage: {
      daily: num(data.usage_daily) ?? 0,
      weekly: num(data.usage_weekly) ?? 0,
      monthly: num(data.usage_monthly) ?? 0,
      total,
      keyLimitRemaining: num(data.limit_remaining),
      balance: purchased !== null && used !== null ? purchased - used : null,
    },
  };
}
