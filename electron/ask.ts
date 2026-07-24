import type { AppSettings } from './config';
import { chatComplete } from './llm';

const EDIT_SYSTEM_PROMPT = [
  'คุณคือผู้ช่วยแก้ไขข้อความที่ผู้ใช้เลือกไว้ ตามคำสั่งเสียงที่พูดมา',
  'ถ้าคำสั่งเสียงเป็นคำสั่งแก้ไข/แปล/สรุป/ปรับโทน ให้ตอบเฉพาะข้อความที่แก้ไขแล้ว พร้อมนำไปวางแทนที่ข้อความเดิมได้ทันที',
  'ถ้าคำสั่งเสียงเป็นคำถามเกี่ยวกับข้อความที่เลือกไว้ ให้ตอบคำถามสั้นกระชับ',
  'ห้ามใส่คำอธิบาย, prefix, หรือ quote ครอบคำตอบ',
].join('\n');

const QA_SYSTEM_PROMPT = [
  'คุณคือผู้ช่วยตอบคำถามเสียงสั้นกระชับ',
  'ตอบเฉพาะคำตอบ ห้ามใส่คำอธิบายหรือ prefix ใดๆ',
].join('\n');

export async function answerOrEdit(
  question: string,
  selectedText: string,
  settings: AppSettings,
): Promise<string> {
  if (!selectedText) {
    return chatComplete(settings, QA_SYSTEM_PROMPT, question);
  }
  const userContent = `ข้อความที่เลือกไว้:\n"""\n${selectedText}\n"""\n\nคำสั่ง/คำถามจากเสียง: ${question}`;
  return chatComplete(settings, EDIT_SYSTEM_PROMPT, userContent);
}
