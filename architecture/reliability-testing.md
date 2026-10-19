# Windows reliability checks

## Run

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

- ก่อน restart: ปิดเฉพาะ OpenPood/Electron/Vite ของ repo นี้; อย่า kill ทุก `node.exe`.
- ตรวจ automated checks แยกจาก OS/visual acceptance.

## Manual checks

| Scenario | Expected |
|---|---|
| กด hotkey รัวระหว่างเปิดไมค์ | เปิด recorder เดียว; แสดงกำลังเปิดไมโครโฟน |
| Escape ระหว่างเริ่ม/อัด | ไมค์ดับ; กลับ idle; ครั้งต่อไปเริ่มได้ |
| Escape ระหว่าง STT/polish/translate | ยกเลิก request; ไม่มีข้อความถูก paste ภายหลัง; เริ่มครั้งต่อไปได้หลัง cancel จบ |
| ปฏิเสธ permission / ถอดไมค์ขณะอัด | แจ้งข้อผิดพลาด; คืนไมค์และ state; ลองใหม่ได้ |
| Saved mic หายไป | ใช้ OS default เฉพาะ device-not-found/constraint error |
| เงียบ / อัดสั้นกว่า 400 ms | ไม่เรียก provider; แสดงไม่ได้ยินเสียง |
| Internet/provider ช้า/ล่ม | มี error หรือ timeout; ไม่ค้าง processing; polish failure ใช้ raw transcript |
| เริ่มใน A แล้ว Alt+Tab ไป B ก่อนกดหยุด | ไม่ paste ไป B; transcript อยู่ clipboard หรือ History |
| เปลี่ยน focus ใกล้จังหวะส่ง Ctrl+V | Native HWND guard ปฏิเสธ; ไม่มีการ retarget |
| Clipboard text / HTML / RTF / image | หลัง paste คืน supported formats; ตรวจปลายทางที่รับ paste ช้า |
| Clipboard มีไฟล์หรือ custom format | Clipboard เดิมอยู่ครบ; แจ้งให้ copy transcript จาก History |
| Copy ข้อมูลใหม่ระหว่าง paste/restore | ไม่คืน clipboard เก่าทับสิ่งที่เพิ่ง copy แม้ข้อความเหมือนกัน |
| Target app เปิดแบบ Administrator | ตรวจ input-injection failure และ clipboard fallback |
| Widget renderer crash | ยกเลิกงานเก่า; สร้าง widget ใหม่; error ซ้ำมี retry limit |
| History 500 entries/ข้อความยาว | แสดงทีละ 30; ก่อนหน้า/ถัดไปใช้ keyboard ได้; copy/clear ยังทำงาน |
| History เขียนไม่ได้ | แจ้งว่า entry อยู่ชั่วคราว; copy จาก History ก่อน quit; ลองบันทึกใหม่หลังแก้ disk/permission |
| ตั้ง hotkey ที่ชนกัน | แจ้ง conflict; คืน hotkey เดิม; Escape ยังใช้ cancel ได้ |
| Tray / quit / หลายจอ | เปิดหน้าได้; widget อยู่จอ cursor; quit ปิด host และรอ history write |

- `pasted: true` ยืนยันว่า host ส่ง input ครบ ไม่ยืนยันว่าแอปปลายทางรับข้อความแล้ว.
- Clipboard restore grace period เป็นค่า configurable; ทดสอบ Word/browser/chat และแอปที่ตอบสนองช้า.
- Cancellation หลังส่ง keystrokeแล้วไม่สามารถดึงข้อความกลับจากแอปปลายทาง.
- History failure เก็บ entry ใน RAM; entry ที่ยังไม่ persist จะหายเมื่อปิดแอป.
- Clipboard handling อ้างอิง [Electron 43.2.0 API](https://github.com/electron/electron/blob/v43.2.0/docs/api/clipboard.md); file/custom formats ที่คืนไม่ได้จะไม่ถูกเขียนทับ.

## Performance diagnostics

```powershell
$env:OPENPOOD_DIAGNOSTICS = '1'
npm.cmd run dev
# หลังจบการวัด
Remove-Item Env:\OPENPOOD_DIAGNOSTICS -ErrorAction SilentlyContinue
```

- จด CPU/working-set ตอน idle, dashboard เปิด, recording และ processing.
- จด `mic-start`, `stt`, `polish`, `translate`, `history`, `paste`, `dictation-total` จาก terminal.
- เปรียบเทียบด้วย provider/model, clip duration และเครื่องเดิม; dev-build memory ไม่เท่ากับ packaged build.
- `paste` timing รวม clipboard restore grace period; อย่านับทั้งหมดเป็นเวลาที่ข้อความเริ่มปรากฏ.
- ปรับ timeout/limits/page size ใน `src/lib/runtimeConfig.ts`; อย่า log key, เสียง, transcript หรือ clipboard เพื่อวัด performance.
