# OpenPud

โปรแกรมแปลงเสียงพูดเป็นข้อความอัตโนมัติ (คล้าย Typeless) สำหรับ Windows — กดปุ่มลัด พูด ปล่อยปุ่ม แล้วข้อความจะถูกวางที่ตำแหน่ง cursor ในแอปที่ใช้งานอยู่ทันที ไม่ต้องสลับหน้าต่าง ไม่ต้องคัดลอกเอง

สร้างด้วย **Electron + TypeScript + Vite + Tailwind CSS v4**

## โมเดลที่แนะนำ (ค่าเริ่มต้น)

แนะนำใช้ **OpenRouter** คีย์เดียว ครอบทั้งถอดเสียงและ AI polish / Translate / Ask:

| หน้าที่ | โมเดล | ทำไม |
|---|---|---|
| **ถอดเสียง (STT)** | [`openai/whisper-large-v3-turbo`](https://openrouter.ai/openai/whisper-large-v3-turbo) | แม่นกว่า `whisper-1` โดยเฉพาะไทย + คำอังกฤษปน และเร็ว/ถูกกว่า Large V3 เต็ม |
| **Chat (polish / translate / ask)** | [`google/gemini-3.5-flash-lite`](https://openrouter.ai/google/gemini-3.5-flash-lite) | เร็ว ถูก เหมาะงานสั้นๆ อย่างเก็บประโยค / แปล / ตอบถาม |

ค่า default ของแอปตั้งแบบนี้ไว้แล้ว (provider = OpenRouter) — เปิดครั้งแรกแค่ใส่ API key จาก [openrouter.ai/keys](https://openrouter.ai/keys) ก็ใช้ได้

ถ้าติดตั้งมาก่อนแล้วและยังเป็น `whisper-1` / `gpt-4o-mini` ให้ไปหน้า **Settings** แล้วเลือก:

1. ผู้ให้บริการ → **OpenRouter**
2. Model → **Whisper Large V3 Turbo**
3. Chat model → `google/gemini-3.5-flash-lite`

## ฟีเจอร์

- 🎙️ **Dictate ด้วยปุ่มลัดทั่วระบบ** — กดจากแอปไหนก็ได้ พูด ปล่อย ข้อความไปวางให้ตรงตำแหน่ง cursor
- 🫧 **Floating pill** — widget โปร่งใส ลอยกลางล่างจอ ไม่แย่ง keyboard focus จากแอปที่กำลังพิมพ์อยู่
- 🔌 **รองรับหลาย provider** — OpenAI, OpenRouter หรือ endpoint ที่ compatible กับ OpenAI `/audio/transcriptions` เอง (เช่น self-hosted whisper.cpp)
- 📖 **Dictionary** — เพิ่มคำเฉพาะ/ชื่อเฉพาะ/ศัพท์เทคนิค ช่วยให้แปลงเสียงแม่นยำขึ้น
- 🔄 **Correction rules** — แทนที่คำที่ถอดผิดซ้ำๆ แบบตรงตัวหลังถอดเสียง
- ✨ **AI polish / Translate / Ask** — เก็บประโยค แปล หรือถามจากเสียง (ใช้ chat model)
- 🕓 **History** — เก็บประวัติการอัดเสียงย้อนหลัง (สูงสุด 500 รายการ) คัดลอกซ้ำได้ทุกเมื่อ
- ⌨️ **ตั้งค่าปุ่มลัดแบบกดจริง** — ไม่ต้องพิมพ์ syntax accelerator เอง กดคีย์ที่ต้องการแล้วระบบจับให้เลย

## ดาวน์โหลด / ติดตั้ง (.exe)

ยังไม่มี release แจก — ต้อง build เองด้วยคำสั่ง:

```bash
npm install
npm run dist
```

ได้ไฟล์ติดตั้งที่ `release/OpenPud Setup 0.0.0.exe` (NSIS, ไม่ต้อง admin) — รันแล้วติดตั้งได้เลย เปิดครั้งแรกจะเจอ onboarding wizard พาไปตั้งค่า API key ทีละขั้น

ต้องการแบบไม่ติดตั้ง (portable): ใช้ `release/win-unpacked/OpenPud.exe` ที่ได้จากคำสั่งเดียวกัน

## เริ่มต้นใช้งาน (dev)

```bash
npm install
npm run dev
```

เปิดแอปหลักได้จาก **tray icon** (มุมล่างขวา) → ใส่ **OpenRouter API Key** ตอน onboarding (ค่าเริ่มต้นชี้ OpenRouter + Whisper Large V3 Turbo + Gemini 3.5 Flash Lite อยู่แล้ว)

> ระหว่างเทสรันซ้ำ: ปิดโปรเซส `electron.exe` / `node.exe` ที่ค้างอยู่ก่อน ไม่งั้น instance ที่สองจะแย่ง global hotkey และพอร์ต Vite dev server กัน

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รัน Vite + Electron แบบ dev, hot reload ทั้ง renderer และ main process |
| `npm run build` | typecheck แล้ว build ทั้งสองฝั่งเป็น production |
| `npm run dist` | build แล้ว pack เป็นไฟล์ติดตั้ง Windows (.exe, NSIS) ด้วย electron-builder |

ไม่มี lint/test แยก แต่ typecheck สองฝั่งแยกกันได้ เพราะแต่ละฝั่งมี `tsconfig.json` และ global types ต่างกัน (`DOM` สำหรับ renderer, `node` สำหรับ main process):

```bash
npx tsc -p tsconfig.json --noEmit          # renderer (src/)
npx tsc -p electron/tsconfig.json --noEmit # main process (electron/)
```

## สถาปัตยกรรม

Electron แยกเป็น 2 โปรเซสอิสระ คุยกันผ่าน `contextBridge` (`electron/preload.ts`) เท่านั้น — `contextIsolation: true`, `nodeIntegration: false`

- **`electron/`** — main process (Node context)
  - `main.ts` — สร้างหน้าต่าง widget + dashboard, จัดการ global hotkey, tray icon
  - `transcribe.ts` — ส่งไฟล์เสียงไป OpenAI-compatible `/audio/transcriptions` endpoint
  - `pasteText.ts` — คัดลอกข้อความไปคลิปบอร์ดแล้วจำลอง Ctrl+V ผ่าน virtual-key (`keybd_event`) ผ่าน PowerShell
  - `config.ts` / `history.ts` / `dictionary.ts` — persistence ด้วย `electron-store` (JSON บนเครื่อง, API key เข้ารหัสด้วย DPAPI)
- **`src/`** — renderer process (DOM context, ไม่มี Node access)
  - `widget.ts` + `recorder.ts` — floating pill, อัดเสียงผ่าน `getUserMedia` + `MediaRecorder`
  - `shell.ts` + `pages/*.ts` — dashboard (Home / History / Dictionary / Settings) เปิดจาก tray icon
  - `pages/onboarding.ts` — first-run wizard แยกธีมจาก dashboard
  - `hotkey.ts` — helper ร่วมสำหรับ render/capture คีย์ลัด

## STT / Chat backend ที่รองรับ

เลือกได้จาก dropdown "ผู้ให้บริการ" ในหน้า Settings ซึ่งจะเติม base URL + model ให้อัตโนมัติ:

| Provider   | Base URL                       | STT (default)                         | Chat (แนะนำ) |
|------------|--------------------------------|----------------------------------------|--------------|
| **OpenRouter (แนะนำ)** | `https://openrouter.ai/api/v1` | `openai/whisper-large-v3-turbo` | `google/gemini-3.5-flash-lite` |
| OpenAI     | `https://api.openai.com/v1`     | `whisper-1`                            | `gpt-4o-mini` |
| กำหนดเอง   | ใส่เอง                          | ใส่เอง                                 | ใส่เอง |

OpenRouter ใช้คีย์เดียวเรียกได้ทั้ง `/audio/transcriptions` และ `/chat/completions` — สะดวกกว่าแยก OpenAI + Google

## ความเป็นส่วนตัวของข้อมูล

Settings, History และ Dictionary เก็บเป็น JSON ในเครื่องล้วน (`electron-store`) ไม่มีการซิงก์ขึ้นคลาวด์ — มีแค่เสียงพูด / ข้อความที่ส่งไป polish เท่านั้นที่ออกนอกเครื่อง และส่งไปยัง endpoint ที่ตั้งค่าไว้เท่านั้น

ดูรายละเอียดสถาปัตยกรรมเชิงลึกเพิ่มเติมได้ที่ `CLAUDE.md`
