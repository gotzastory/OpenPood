# OpenPud

โปรแกรมแปลงเสียงพูดเป็นข้อความอัตโนมัติ (คล้าย Typeless) สำหรับ **Windows** — กดปุ่มลัด พูด ปล่อยปุ่ม แล้วข้อความจะถูกวางที่ตำแหน่ง cursor ในแอปที่กำลังใช้งานอยู่ทันที ไม่ต้องสลับหน้าต่าง ไม่ต้องคัดลอกเอง

สร้างด้วย Electron + TypeScript + Vite + Tailwind CSS v4

**[ดาวน์โหลดตัวติดตั้งล่าสุด](https://github.com/gotzastory/OpenPud/releases/latest)** · [Releases ทั้งหมด](https://github.com/gotzastory/OpenPud/releases)

---

## สารบัญ

- [ดาวน์โหลด / ติดตั้ง](#ดาวน์โหลด--ติดตั้ง)
- [ความต้องการของระบบ](#ความต้องการของระบบ)
- [เริ่มใช้งาน (ผู้ใช้ทั่วไป)](#เริ่มใช้งาน-ผู้ใช้ทั่วไป)
- [วิธีใช้](#วิธีใช้)
- [ฟีเจอร์](#ฟีเจอร์)
- [โมเดลที่แนะนำ](#โมเดลที่แนะนำ)
- [STT / Chat backend](#stt--chat-backend-ที่รองรับ)
- [ความเป็นส่วนตัว](#ความเป็นส่วนตัวของข้อมูล)
- [พัฒนาต่อ (สำหรับนักพัฒนา)](#พัฒนาต่อ-สำหรับนักพัฒนา)
- [แก้ปัญหาเบื้องต้น](#แก้ปัญหาเบื้องต้น)

---

## ดาวน์โหลด / ติดตั้ง

ดาวน์โหลดตัวติดตั้งจาก [GitHub Releases](https://github.com/gotzastory/OpenPud/releases/latest) — **ไม่ต้องมี Node.js**

1. เปิดหน้า Releases แล้วดาวน์โหลด `OpenPud Setup x.x.x.exe`
2. ดับเบิลคลิกเพื่อติดตั้ง (NSIS, ไม่ต้องสิทธิ์ admin)
3. เปิดแอปครั้งแรก → onboarding wizard จะพาตั้งค่า API key / ไมค์ / ปุ่มลัด

ถ้า Windows แสดง SmartScreen (“Windows protected your PC”) เพราะยังไม่ได้ code-sign:

1. กด **More info**
2. กด **Run anyway**

แบบ portable (ไม่ติดตั้ง): หลัง build เอง ใช้ `release/win-unpacked/OpenPud.exe`

---

## ความต้องการของระบบ

| รายการ | รายละเอียด |
|---|---|
| OS | Windows 10 / 11 (x64) |
| ไมโครโฟน | มีไมค์ (built-in หรือ USB) และอนุญาตสิทธิ์ไมค์ให้แอป |
| อินเทอร์เน็ต | จำเป็นตอนถอดเสียง / ใช้ AI (เรียก API ของ provider ที่เลือก) |
| API key | [OpenRouter](https://openrouter.ai/keys) (แนะนำ), [Google AI Studio](https://aistudio.google.com/app/apikey), หรือ [OpenAI](https://platform.openai.com/api-keys) |

---

## เริ่มใช้งาน (ผู้ใช้ทั่วไป)

1. ติดตั้งจาก `.exe` ด้านบน
2. ตอน onboarding เลือก **OpenRouter** แล้ววาง API key จาก [openrouter.ai/keys](https://openrouter.ai/keys)
3. อนุญาตไมโครโฟนเมื่อระบบถาม
4. ตั้งปุ่มลัด (ค่าเริ่มต้น `Ctrl+Space`) หรือใช้ค่าเดิมก็ได้
5. เปิดแอปที่อยากพิมพ์ (เช่น Word, Chrome, Slack) → วาง cursor ไว้ตำแหน่งที่ต้องการ → กดปุ่มลัด พูด ปล่อย → ข้อความถูกวางให้อัตโนมัติ

เปิดหน้าต่างตั้งค่า / ประวัติได้จาก **ไอคอนถาดระบบ (tray)** มุมล่างขวาของ Windows — ไม่มีปุ่มเปิดจาก floating pill โดยตั้งใจ

ออกจากโปรแกรม: คลิกขวาที่ tray → **ออกจากโปรแกรม** (ปิดหน้าต่างอย่างเดียวแอปยังรันอยู่)

---

## วิธีใช้

วาง cursor ในช่องพิมพ์ของแอปใดก็ได้ แล้วใช้โหมดตามปุ่มลัด:

| โหมด | ปุ่มลัดเริ่มต้น | ทำอะไร |
|---|---|---|
| **Dictate** | `Ctrl+Space` | อัดเสียง → ถอดเป็นข้อความ → วางที่ cursor |
| **Translate** | `Ctrl+Alt+T` | พูดภาษาใดก็ได้ → แปลเป็นภาษาเป้าหมายใน Settings แล้ววาง |

เปลี่ยนปุ่มลัดได้จากหน้า Home หรือ Settings (กดคีย์จริง — ไม่ต้องจำ syntax ของ Electron)

เคล็ดลับ:

- Pill ลอยกลางล่างจอจะโผล่ตอนกำลังอัด / ประมวลผล แล้วหายเมื่อเสร็จ — ไม่แย่ง keyboard focus จากแอปที่กำลังพิมพ์
- เปิด **AI polish** ใน Settings ถ้าอยากให้ประโยค Dictate ถูกเก็บให้เรียบร้อยอัตโนมัติหลังถอดเสียง
- เพิ่มคำใน **Dictionary** และกฎใน **Correction rules** ช่วยลดคำที่ถอดผิดซ้ำๆ (ชื่อคน, ศัพท์เทคนิค, แบรนด์)

---

## ฟีเจอร์

- **Dictate ด้วยปุ่มลัดทั่วระบบ** — กดจากแอปไหนก็ได้ พูด ปล่อย ข้อความไปวางตรง cursor
- **Floating pill** — widget โปร่งใส ลอยกลางล่างจอ ไม่แย่ง focus
- **หลาย provider** — OpenAI, OpenRouter, Gemini (Google AI Studio) หรือ endpoint ที่เข้ากันกับ OpenAI `/audio/transcriptions` (เช่น self-hosted whisper.cpp)
- **Dictionary** — คำเฉพาะ / ชื่อเฉพาะ / ศัพท์เทคนิค ช่วย bias การถอดเสียง
- **Correction rules** — แทนที่คำที่ถอดผิดซ้ำๆ แบบตรงตัวหลังถอดเสียง
- **AI polish / Translate** — เก็บประโยค หรือแปลจากเสียง (ใช้ chat model)
- **History** — ประวัติการถอดเสียงสูงสุด 500 รายการ คัดลอกซ้ำได้
- **ตั้งค่าปุ่มลัดแบบกดจริง** — กดคีย์ที่ต้องการ ระบบจับ accelerator ให้เอง
- **เปิดตอน Windows เริ่ม** — เปิด/ปิดได้ใน Settings

---

## โมเดลที่แนะนำ

แนะนำใช้ **OpenRouter** คีย์เดียว ครอบทั้งถอดเสียงและ AI polish / Translate:

| หน้าที่ | โมเดล | ทำไม |
|---|---|---|
| **ถอดเสียง (STT)** | [`openai/whisper-large-v3-turbo`](https://openrouter.ai/openai/whisper-large-v3-turbo) | แม่นกว่า `whisper-1` โดยเฉพาะไทย + คำอังกฤษปน และเร็ว/ถูกกว่า Large V3 เต็ม |
| **Chat (polish / translate)** | [`google/gemini-3.5-flash-lite`](https://openrouter.ai/google/gemini-3.5-flash-lite) | เร็ว ถูก เหมาะงานสั้นๆ อย่างเก็บประโยค / แปล |

ค่า default ของแอปตั้งแบบนี้ไว้แล้ว — เปิดครั้งแรกแค่ใส่ API key ก็ใช้ได้

ถ้าติดตั้งเวอร์ชันเก่าแล้วยังเป็น `whisper-1` / `gpt-4o-mini` ให้ไปหน้า **Settings** แล้วเลือก:

1. ผู้ให้บริการ → **OpenRouter**
2. Model → **Whisper Large V3 Turbo**
3. Chat model → `google/gemini-3.5-flash-lite`

---

## STT / Chat backend ที่รองรับ

เลือกจาก dropdown **ผู้ให้บริการ** ใน Settings — จะเติม Base URL + model ให้อัตโนมัติ:

| Provider | Base URL | STT (default) | Chat (แนะนำ) |
|---|---|---|---|
| **OpenRouter (แนะนำ)** | `https://openrouter.ai/api/v1` | `openai/whisper-large-v3-turbo` | `google/gemini-3.5-flash-lite` |
| Gemini (Google AI Studio) | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash` | `gemini-3.5-flash-lite` |
| OpenAI | `https://api.openai.com/v1` | `whisper-1` | `gpt-4o-mini` |
| กำหนดเอง | ใส่เอง | ใส่เอง | ใส่เอง |

OpenRouter / OpenAI ใช้คีย์เดียวเรียกได้ทั้ง `/audio/transcriptions` และ `/chat/completions` — Gemini ใช้ API แบบ native (`generateContent` + audio) จาก [Google AI Studio](https://aistudio.google.com/app/apikey)

---

## ความเป็นส่วนตัวของข้อมูล

- Settings, History และ Dictionary เก็บเป็น JSON **ในเครื่องเท่านั้น** (`electron-store`) ไม่ซิงก์ขึ้นคลาวด์ของแอป
- API key เข้ารหัสด้วย Windows DPAPI ผ่าน Electron `safeStorage`
- มีแค่เสียงพูด / ข้อความที่ส่งไปถอดเสียงหรือ polish เท่านั้นที่ออกนอกเครื่อง และส่งไปยัง endpoint ที่คุณตั้งไว้เท่านั้น

---

## พัฒนาต่อ (สำหรับนักพัฒนา)

### Dev

```bash
npm install
npm run dev
```

เปิดแอปหลักจาก **tray icon** → ใส่ API key ตอน onboarding

> ระหว่างเทสรันซ้ำ: ปิดโปรเซส `electron.exe` / `node.exe` ที่ค้างอยู่ก่อน ไม่งั้น instance ที่สองจะแย่ง global hotkey และพอร์ต Vite

### คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รัน Vite + Electron แบบ hot reload |
| `npm run build` | typecheck แล้ว build production |
| `npm run dist` | build แล้ว pack เป็น `.exe` (NSIS) ด้วย electron-builder → ออกที่ `release/` |

Typecheck แยกสองฝั่ง (global types คนละชุด):

```bash
npx tsc -p tsconfig.json --noEmit          # renderer (src/)
npx tsc -p electron/tsconfig.json --noEmit # main process (electron/)
```

### Build ตัวติดตั้งเอง

```bash
npm install
npm run dist
```

ได้ไฟล์ `release/OpenPud Setup 0.1.0.exe` และแบบ portable ที่ `release/win-unpacked/OpenPud.exe`

### สถาปัตยกรรมโดยย่อ

Electron แยก 2 โปรเซส คุยกันผ่าน `contextBridge` (`electron/preload.ts`) เท่านั้น — `contextIsolation: true`, `nodeIntegration: false`

- **`electron/`** — main process: หน้าต่าง widget + dashboard, global hotkey, tray, ถอดเสียง, วางข้อความ, persistence
- **`src/`** — renderer: floating pill, อัดเสียง, dashboard (Home / History / Dictionary / Settings), onboarding

รายละเอียดเชิงลึกอยู่ที่ [`CLAUDE.md`](./CLAUDE.md)

---

## แก้ปัญหาเบื้องต้น

| อาการ | วิธีเช็ค |
|---|---|
| กดปุ่มลัดแล้วไม่มีอะไรเกิดขึ้น | ดูว่าแอปยังรันอยู่ที่ tray หรือไม่ / ปุ่มลัดชนกับโปรแกรมอื่นหรือยัง / ลองเปลี่ยนปุ่มลัดใน Settings |
| ถอดเสียงไม่สำเร็จ | ตรวจ API key, เครือข่าย, และยอดเครดิตของ provider — แอปจะแจ้งด้วย Windows Notification |
| ไม่ได้ยินเสียง / waveform ไม่ขยับ | อนุญาตไมค์ให้ OpenPud ใน Windows Settings → Privacy → Microphone แล้วเลือกไมค์ในแอป |
| ข้อความไม่วางลงแอปเป้าหมาย | คลิกโฟกัสช่องพิมพ์ก่อนกดปุ่มลัด — แอปวางด้วย Ctrl+V ผ่านคลิปบอร์ด |
| SmartScreen บล็อกตัวติดตั้ง | More info → Run anyway (ดูส่วนติดตั้งด้านบน) |
| `npm run dist` ขึ้น EPERM | ปิด `npm run dev` / ปิด OpenPud ที่เปิดอยู่ แล้วลบโฟลเดอร์ `release/` ก่อน build ใหม่ |

---

## License

ยังไม่ได้กำหนด license แบบเปิดเผยใน repo — ใช้งาน / fork ตามนโยบายของเจ้าของโปรเจกต์จนกว่าจะระบุชัดเจน
