# OpenPood — Security & Code Structure Audit

> ตรวจเมื่อ 2026-09-02 · ครอบคลุม `electron/` (main process) และ `src/` (renderer) ทั้งหมด ~2,900 บรรทัด
> ✅ = แก้แล้วในรอบนี้ · ⬜ = backlog

---

## สรุปภาพรวม

จุดแข็งเดิมของโปรเจกต์: `contextIsolation: true` / `nodeIntegration: false` ทั้งสอง window, preload expose API แคบ (ไม่มี raw `ipcRenderer` หลุดไป renderer), API key เข้ารหัสด้วย `safeStorage` (DPAPI) ตอนเก็บลงดิสก์, ไม่มี secrets commit ใน repo, dependency runtime มีตัวเดียว (`electron-store`)

**ยืนยันแล้วว่าไม่มี command injection ใน pasteText.ts** — ข้อความ transcript ไป target app ผ่าน clipboard เท่านั้น สคริปต์ PowerShell เป็น constant ล้วน ไม่มี interpolation

ปัญหาหลักที่พบ: ไม่มี CSP, stored XSS หลายจุดจากการ interpolate ค่า user ลง `innerHTML` โดยไม่ escape, API key ถูก decrypt แล้วส่งเข้า renderer ทุกครั้งที่เรียก `settings:get`, `apiBaseUrl` ไม่ validate (SSRF + key exfiltration), IPC ไม่มี payload validation, `strict` mode ปิดทั้งสอง tsconfig และ main process ไม่ถูก typecheck ตอน build

---

## Security Findings

### HIGH

- ✅ **H1 — ไม่มี Content-Security-Policy**
  `index.html` ไม่มี meta CSP, main process ไม่ set header → HTML injection ใดๆ กลายเป็น script execution + `fetch()` ออกไปไหนก็ได้
  **แก้แล้ว:** เพิ่ม meta CSP ใน `index.html` — `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, connect-src จำกัดที่ localhost (Vite HMR), whitelist Google Fonts สำหรับ onboarding

- ✅ **H2 — Stored XSS: ค่า user ลง `innerHTML` โดยไม่ escape**
  `settings.ts` (apiKey/apiBaseUrl/model/chatModel/device labels), `onboarding.ts` (apiKey/hotkey/device labels), `hotkey.ts:6` (hotkey render ดิบบน Home ทุกครั้งที่เปิดแอป — chain ที่ร้ายสุด: ใส่ payload ในช่อง hotkey ตอน onboarding → persist → รันทุกครั้งที่เปิด dashboard)
  **แก้แล้ว:** สร้าง [src/escape.ts](src/escape.ts) แล้ว escape ทุกจุด interpolation

- ✅ **H3 — `escapeHtml` เดิมไม่ escape quotes → attribute injection**
  ก็อปปี้ 2 ชุดใน `dictionary.ts` / `history.ts` ใช้ trick `div.textContent → innerHTML` ซึ่ง escape แค่ `& < >` ไม่ escape `"` `'` แต่ถูกใช้ใน attribute (`data-word="..."`, `aria-label="..."`) — คำใน dictionary ที่มี `"` หลุด attribute ได้
  **แก้แล้ว:** แทนด้วย `escapeHtml` กลางที่ escape ครบ 5 ตัว ทั้งสองไฟล์

- ✅ **H4 — API key ถูกส่งเข้า renderer แบบ plaintext ทุกครั้งที่ `settings:get`**
  รวมถึง widget window ที่รันตลอดเวลา — script ที่ inject ได้อ่าน key แล้วส่งออกได้ทันที
  **แก้แล้ว:** `settings:get` คืน `apiKey: ''` + `hasApiKey: boolean` (`getRendererSettings()` ใน [electron/config.ts](electron/config.ts)) — key จริงไม่ออกจาก main process อีก. หน้า Settings/Onboarding แสดง placeholder "•••• บันทึกไว้แล้ว" และช่องว่าง = คงค่าเดิม

### MEDIUM

- ✅ **M1 — `apiBaseUrl` ไม่ validate (SSRF + ส่ง Bearer token ไป host ใดก็ได้)**
  **แก้แล้ว:** `validateApiBaseUrl()` ใน [electron/config.ts](electron/config.ts) — บังคับ `https:`, อนุญาต `http:` เฉพาะ loopback (localhost/127.0.0.1/::1) เพื่อรองรับ local Whisper/LM Studio. Reject แล้วขึ้น error message ในหน้า Settings

- ✅ **M2 — `settings:set` เขียน key อะไรก็ได้ลง store (`as never` ปิด type check)**
  **แก้แล้ว:** allowlist `WRITABLE_KEYS` จาก `defaults` + เช็ค typeof ของ value ต้องตรงกับ default — ปิดทั้ง arbitrary keys, dotted-path writes, และ type confusion

- ✅ **M3 — ไม่มี navigation/window-open hardening**
  **แก้แล้ว:** `hardenWindow()` ใน [electron/main.ts](electron/main.ts) — `setWindowOpenHandler` deny ทุก popup, `will-navigate` block ทุก URL นอก bundle/dev server ทั้งสอง window

- ⬜ **M4 — Google Fonts `@import` ใน `onboarding.css:1`** — remote fetch ทุกครั้งที่เปิด onboarding (fingerprinting + พังตอน offline). รอบนี้ whitelist ใน CSP ไว้ก่อน; ถาวรควร self-host font files

- ⬜ **M5 — `history.json` เก็บ transcript สูงสุด 500 รายการแบบ plaintext** — transcript อาจมี password/ข้อมูลส่วนตัว. `safeStorage` มีใช้อยู่แล้วใน config.ts แต่ยังไม่ใช้กับ history. หมายเหตุ: ข้อความในหน้า Home ("ไม่ถูกเก็บไว้ในเครื่อง") จริงเฉพาะไฟล์เสียง ไม่จริงสำหรับ text — ควรแก้ copy ด้วย

- ✅ **M6 — Response body จาก server แสดงใน OS Notification ดิบ**
  **แก้แล้ว:** truncate error body ที่ 300 chars ใน `transcribe.ts` / `llm.ts` / `gemini.ts` และ 200 chars ก่อนเข้า `Notification` ใน `main.ts`

### LOW

- ✅ **L2 — `powershell.exe` resolve ผ่าน PATH** → pin absolute path `%SystemRoot%\System32\...` ผ่าน [electron/powershell.ts](electron/powershell.ts) ใช้ทั้ง `pasteText.ts` และ `activeWindow.ts`
- ✅ **L3 — `transcription:run` ไม่จำกัดขนาด buffer** → validate: ต้องเป็น `ArrayBuffer`, ไม่ว่าง, ≤ 50MB + เช็ค `mimeType` เป็น string, `mode` ต้องเป็นค่าที่รู้จัก
- ✅ **L6 — `app:open-main-window` ไม่ whitelist route** → เช็คกับ `ALLOWED_ROUTES` (5 routes)
- ⬜ **L1 — Clipboard exposure ~340ms ต่อ dictation** + restore เป็น text-only (ทำลาย clipboard image/file ของ user). แก้ยากโดยไม่ใช้ native module — รับความเสี่ยงไว้ หรือพิจารณา `SendInput` แบบ Unicode injection แทน clipboard
- ⬜ **L4 — `sandbox: true` ไม่ set explicit** — Electron ≥20 sandbox renderer เป็น default อยู่แล้ว แต่ repo นี้ใช้ **preload แบบ ESM (`preload.mjs`)** ซึ่ง Electron รองรับเฉพาะ unsandboxed renderer — เปิด `sandbox: true` ตรงๆ แอปพัง. ถ้าอยากได้ต้องเปลี่ยน preload build เป็น CJS ก่อน
- ⬜ **L5 — ไม่มี code signing / autoupdater** — installer ไม่ sign (SmartScreen warning, tamper ได้) และไม่มีช่องทาง push security fix

---

## Code Structure Findings

### แก้แล้วรอบนี้

- ✅ **`stripFillers` กินคำไทยแท้กลางประโยค (correctness bug ร้ายแรง)** — pattern จับกลางสตริงหลัง Thai spacing ถูก collapse ไปแล้ว ทำให้ อ่าน→น, อ่าง→ง, อ่าว→ว, อูมามิ→ามิ, น้ำเอ่อ→น้ำ, "uh-huh"→"-huh" และตัด "เออ" (คำตอบรับ) ทิ้ง
  **แก้:** สลับลำดับ pipeline — `stripFillers` รันบน raw transcript (ช่องว่างจาก Whisper ยังอยู่) แล้วค่อย `normalizeThaiSpacing` ([electron/main.ts](electron/main.ts)); pattern ยึด token boundary แทนการเดากลางคำ, เลิกตัด "เออ" เดี่ยว (ต้องมีวรรณยุกต์ เอ่อ/เอ้อ), กัน "uh-huh" ด้วย hyphen guard. Trade-off ที่เลือก: filler ที่ติดกับคำถัดไปแบบไม่มีช่องว่างจะรอด (พลาดดีกว่ากินคำจริง — AI polish เก็บตกได้)
  **Tests:** เพิ่ม vitest + [electron/stripFillers.test.ts](electron/stripFillers.test.ts) 20 cases (`npm test`) + [vitest.config.ts](vitest.config.ts) แยกจาก vite.config.ts กัน electron plugin spawn ตอน test

- ✅ **`strict` ปิดทั้งสอง tsconfig** → เปิด `"strict": true` ทั้งคู่ (ผ่าน typecheck 0 errors) + เพิ่ม `noFallthroughCasesInSwitch` ให้ electron config เท่ากับ root
- ✅ **main process ไม่ถูก typecheck ตอน build** → เพิ่ม script `typecheck` (ทั้งสอง target) แล้วให้ `build` เรียกก่อน `vite build`
- ✅ **`app.whenReady().then()` ไม่มี `.catch`** — startup throw จะทำให้ IPC handler ไม่ถูก register เลยแบบเงียบๆ → เพิ่ม `.catch` (log + `dialog.showErrorBox` + quit)
- ✅ **IPC handlers ไม่ validate payload** → `settings:set` เช็ค object, `dictionary:set`/`corrections:set` filter เฉพาะ element ที่ type ถูก, `transcription:run` validate ครบ
- ✅ **`beginRecording` เรียก `getSettings()` นอก try** — IPC reject แล้ว pill ค้าง → ย้ายเข้า try ([src/widget.ts](src/widget.ts))
- ✅ **Listener leak ใน history page** — subscribe `onHistoryUpdated` ซ้ำทุกครั้งที่ navigate เข้า `/history` โดยทิ้ง unsubscribe → เก็บ unsubscribe ระดับ module แล้วเรียกก่อน subscribe ใหม่
- ✅ **Hotkey clear ไม่ได้** — guard `if (partial.hotkey || ...)` เป็น falsy check → เปลี่ยนเป็น `!== undefined`
- ✅ **`display-metrics-changed` listener ซ้อน** — register ใน `createWidget()` ซึ่งถูกเรียกซ้ำตอน `activate` → ย้ายไป register ครั้งเดียวใน `whenReady`
- ✅ **Silent catch ในหน้า Settings + hotkey modal** → log error + แสดงข้อความจริง (รวม validation message จาก main)
- ✅ **`escapeHtml` ก็อปซ้ำ 2 ไฟล์** → รวมเป็น [src/escape.ts](src/escape.ts)

### Backlog (เรียงตามความคุ้ม)

- ⬜ **Provider config ซ้ำ 4 ที่** — `electron/config.ts` (defaults), `src/pages/settings.ts` (`PROVIDER_PRESETS`), `src/pages/onboarding.ts` (`PROVIDERS`), `electron/gemini.ts` (`GEMINI_API_BASE`) — เพิ่ม provider ต้องแก้ 4 จุดโดย compiler ไม่ช่วย. ควรรวมเป็น `src/providers.ts` เดียวที่ทั้ง main และ renderer import
- ⬜ **`src/types.d.ts` hand-mirror preload ทั้งชุด** — `electron/preload.ts` export `TypelessApi` อยู่แล้วแต่ไม่มีใคร import. ควรให้ types.d.ts ใช้ `typeof api` จาก preload แล้วลบ interface ที่เขียนมือ (กัน drift เงียบ)
- ⬜ **แยก transcription pipeline ออกจาก `electron/main.ts`** — business logic หลักของแอป (transcribe → stripFillers → corrections → translate/polish → paste → history) ฝังใน IPC handler, test ไม่ได้ → ย้ายเป็น `electron/pipeline.ts`
- ⬜ **แยก `onboarding.ts` (355 บรรทัด, 7 concerns) / `settings.ts` (281) / hotkey modal ใน `home.ts`** เป็น module ย่อย
- ⬜ **ไม่มี lint / formatter / CI** — ESLint (`no-floating-promises` จะจับบั๊กที่เจอรอบนี้ได้เกือบหมด), Prettier (ตอนนี้ quote style แตกกันระหว่าง electron/ กับ src/), GitHub Actions typecheck+build+test. Tests มีแล้วสำหรับ `stripFillers` (vitest) — target ต่อไปที่คุ้ม: `applyCorrections`, `normalizeThaiSpacing`, `acceleratorKeyFromCode`
- ⬜ **Error handling ที่เหลือ** — `renderPage` ใน `shell.ts` เป็น floating promise (IPC reject = หน้าขาวเงียบๆ), `loadURL` ไม่มี `.catch`, transcription/mic ล้มเหลวใน widget แสดงแค่ console (Notification จาก main ครอบเฉพาะ transcription:run)
- ⬜ **Dead code** — icons ไม่ใช้ 5 ตัว (`mail`, `hash`, `sparkles`, `fileText`, `messageCircle`), `history`/`clock` icon byte-identical, `getSetting()` ใน config.ts ไม่มีคนเรียก, `concurrently`/`cross-env` ใน devDependencies ไม่มี script ใช้
- ⬜ **Recorder leak ตอน retry** — `widget.ts`: ถ้า `recorder.start(deviceId)` fail หลัง `getUserMedia` สำเร็จ stream แรกไม่ถูก teardown ก่อน fallback
- ⬜ **`import "./types.d.ts"` ใน `src/main.ts`** — idiom แปลก (ต้องพึ่ง `allowArbitraryExtensions`) ขณะที่ `home.ts` import แบบ `"../types"` — ควรใช้ convention เดียว

---

## Todolist สรุป

### เสร็จแล้ว (commit นี้)
- [x] CSP ใน `index.html`
- [x] `src/escape.ts` + escape ทุกจุด interpolation (settings, onboarding, hotkey, dictionary, history)
- [x] Redact `apiKey` จาก `settings:get` (`hasApiKey` แทน) + UI placeholder
- [x] Validate `apiBaseUrl` (https only, http เฉพาะ loopback)
- [x] Allowlist keys + typeof check ใน `setSettings`
- [x] `will-navigate` / `setWindowOpenHandler` deny ทั้งสอง window
- [x] Truncate server error bodies ก่อนเข้า Notification
- [x] Whitelist route `app:open-main-window`
- [x] Absolute path `powershell.exe`
- [x] จำกัดขนาด + validate payload `transcription:run`
- [x] `strict: true` ทั้งสอง tsconfig + typecheck electron ใน `npm run build`
- [x] `.catch` บน `whenReady`, validate IPC payloads, แก้ hotkey clear, แก้ listener leak, แก้ pill ค้าง, แก้ listener ซ้อน, แก้ silent catches

### Backlog (เรียงตาม priority)
- [ ] เข้ารหัส `history.json` ด้วย `safeStorage` + แก้ copy หน้า Home เรื่อง privacy (M5)
- [ ] รวม provider config เป็นไฟล์เดียว
- [ ] ใช้ `TypelessApi` จาก preload แทน hand-mirror `types.d.ts`
- [ ] แยก pipeline จาก `main.ts` → `electron/pipeline.ts`
- [ ] ESLint + Prettier + tests (pure functions) + CI
- [ ] Self-host fonts แทน Google Fonts `@import` แล้วตัดออกจาก CSP (M4)
- [ ] Code signing + autoupdater (L5)
- [ ] เปลี่ยน preload เป็น CJS แล้วเปิด `sandbox: true` (L4)
- [ ] แยก onboarding/settings/hotkey modal เป็น modules
- [ ] Dead code cleanup
- [ ] Error handling ที่เหลือ (shell.ts floating promises, widget error UI)
- [ ] Recorder stream leak ตอน fallback
