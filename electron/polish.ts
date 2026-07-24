import type { AppSettings } from './config';
import type { AppCategory } from './activeWindow';
import { chatComplete } from './llm';

const CATEGORY_HINT: Record<AppCategory, string> = {
  email: 'กำลังจะวางในอีเมล — โทนสุภาพ เป็นทางการเล็กน้อย ขึ้นต้น-ลงท้ายเหมาะสม',
  chat: 'กำลังจะวางในแชท — โทนกันเอง ไม่ต้องเป็นทางการ',
  code: 'กำลังจะวางเป็น commit message หรือ comment ในโค้ด — กระชับ ตรงประเด็น',
  browser: 'กำลังจะวางในเว็บเบราว์เซอร์ทั่วไป',
  general: 'ข้อความทั่วไป',
};

function polishSystemPrompt(category: AppCategory): string {
  return [
    'คุณคือตัวช่วยเก็บงานข้อความที่ถอดเสียงมาจากการพูด',
    `บริบทที่จะใช้ข้อความนี้: ${CATEGORY_HINT[category]}`,
    'ตัดคำอุทาน/คำติดปากที่เหลือ (อืมม, เอ่ออ, อ่า, um, uh) ใส่วรรคตอนให้เหมาะสม แก้ไวยากรณ์เล็กน้อยที่ผิดจากการพูด',
    'ห้ามเปลี่ยนความหมาย ห้ามเพิ่มเนื้อหาใหม่ ห้ามแปลภาษา — คงเฉพาะภาษาไทยและอังกฤษตามที่พูด (อย่าแปลงเป็นภาษาอื่น)',
    'ตอบเฉพาะข้อความที่แก้แล้วเท่านั้น ห้ามใส่คำอธิบายหรือ prefix ใดๆ เพิ่ม',
  ].join('\n');
}

export async function polishText(
  text: string,
  settings: AppSettings,
  category: AppCategory,
): Promise<string> {
  if (!text.trim()) return text;
  try {
    const result = await chatComplete(settings, polishSystemPrompt(category), text);
    return result || text;
  } catch (err) {
    // Never let a broken polish step block dictation — fall back to the raw transcript.
    console.error('AI polish failed, falling back to raw transcript:', err);
    return text;
  }
}
