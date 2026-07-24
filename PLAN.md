# OpenPud — Roadmap (จาก research OpenTypeless)

อ้างอิง: https://github.com/tover0314-w/opentypeless (Tauri/Rust+React, feature set ใกล้เคียง OpenPud แต่ครบกว่า)

ทำครบทั้ง 5 ข้อแล้ว ✅ — สรุปสิ่งที่ implement จริงไว้ด้านล่าง (ไม่ใช่แค่แผนอีกต่อไป)

## 1. Correction rules ใน Dictionary ✅
- `electron/dictionary.ts`: เพิ่ม `corrections: {from, to}[]` แยกจาก `words` (bias) เดิม
- `applyCorrections()` รันหลัง `transcribeAudio()` ก่อน paste/history ใน `electron/main.ts`
- UI: หน้า Dictionary (`src/pages/dictionary.ts`) เพิ่ม section "Correction rules"

## 2. เข้ารหัส API key ✅
- `electron/config.ts`: ใช้ `safeStorage` (DPAPI) เข้ารหัส apiKey ก่อนเซฟ เก็บเป็น `apiKeyEncrypted` บนดิสก์
- migrate อัตโนมัติจาก plaintext เก่า, ฝั่ง renderer/IPC ไม่กระทบ (ยัง get/set เป็น plaintext เหมือนเดิม)

## 3. Optional AI polish หลัง Dictate ✅
- `electron/llm.ts`: `chatComplete()` helper ใช้ endpoint/API key เดียวกับ STT
- `electron/polish.ts`: ตัดคำติดปาก ใส่วรรคตอน ปรับโทนตาม app category (ข้อ 5) — fail แล้ว fallback เป็น raw transcript เสมอ ไม่ทำให้ dictation ใช้งานไม่ได้
- Settings: toggle `aiPolishEnabled` (default ปิด) + `chatModel` field

## 4. Translate / Ask anything ✅
- **Translate**: `electron/translate.ts`, hotkey แยก (`translateHotkey`, default `Control+Alt+T`), แปลตาม `translateTargetLang` ที่ตั้งใน Settings
- **Ask anything**: `electron/selection.ts` (จำลอง Ctrl+C อ่านข้อความที่เลือกไว้) + `electron/ask.ts` (ตอบคำถาม/แก้ไขข้อความที่เลือก), hotkey แยก (`askHotkey`, default `Control+Alt+A`)
- ตัดสินใจ **ไม่สร้าง floating panel ใหม่** — ผลลัพธ์ paste-at-cursor เหมือน Dictate/Translate เพื่อไม่เพิ่มความซับซ้อนเรื่อง window management (ต่างจากแผนเดิมที่คิดว่าต้องมี UI ลอยแยก)
- `src/pages/home.ts`: เลิก blur/badge "เร็วๆ นี้" แล้ว, ปุ่มเฟืองตั้งค่าคีย์ลัดมีครบทั้ง 3 โหมด (generalize modal เดียวใช้ร่วมกัน)

## 5. App-aware tone adjustment ✅
- `electron/activeWindow.ts`: query foreground process ผ่าน PowerShell + Win32 P/Invoke (`GetForegroundWindow`/`GetWindowThreadProcessId`), map เป็น category (email/chat/code/browser/general)
- ป้อนเข้า system prompt ของ AI polish (ข้อ 3) เท่านั้น — ยังไม่ได้ใช้กับ Translate/Ask (ไม่จำเป็นสำหรับสองโหมดนั้น)

---

## แนวคิดต่อยอด (ยังไม่ได้ทำ, ไม่ใช่ priority ตอนนี้)

- Ask anything: ถ้าอยากได้ floating panel แสดงคำตอบแทน paste-at-cursor ต้องออกแบบ window ใหม่ (effort สูง)
- Category mapping ใน `activeWindow.ts` เป็น hint แบบ hardcode — เพิ่ม process name ใหม่ได้เรื่อยๆ ถ้าเจอแอปที่ยังไม่ถูก detect
- `chatModel` เป็น free-text เดียวใช้ร่วมกันทั้ง polish/translate/ask — ถ้าต้องการแยก model ต่อโหมดค่อยเพิ่มทีหลัง
