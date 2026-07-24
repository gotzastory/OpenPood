import type { AppSettings } from './config';
import { chatComplete } from './llm';

export const TRANSLATE_LANGUAGES: Record<string, string> = {
  en: 'English',
  th: 'Thai',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  vi: 'Vietnamese',
};

export async function translateText(text: string, settings: AppSettings): Promise<string> {
  if (!text.trim()) return text;
  const targetName = TRANSLATE_LANGUAGES[settings.translateTargetLang] ?? settings.translateTargetLang;
  const system = [
    `แปลข้อความต่อไปนี้เป็นภาษา ${targetName}`,
    'รักษาโทนและความหมายเดิมให้มากที่สุด',
    'ตอบเฉพาะคำแปลเท่านั้น ห้ามใส่คำอธิบายหรือข้อความต้นฉบับซ้ำ',
  ].join('\n');
  const result = await chatComplete(settings, system, text);
  return result || text;
}
