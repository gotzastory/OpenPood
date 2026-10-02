import { useEffect, useRef, useState } from "react";
import { acceleratorFromEvent } from "../lib/hotkey";
import { BTN, BTN_PRIMARY } from "../lib/uiClasses";

export function HotkeyBadges({ hotkey }: { hotkey: string }) {
  return (
    <>
      {hotkey.split("+").map((key, index) => (
        <kbd
          key={`${key}:${index}`}
          className="rounded-md border border-base-300 bg-base-200 px-2.5 py-1 text-xs font-semibold text-base-content/75 shadow-[0_1px_0_var(--color-base-300)]"
        >
          {key.trim()}
        </kbd>
      ))}
    </>
  );
}

export function HotkeyModal({
  modeName,
  currentHotkey,
  onClose,
  onSave,
}: {
  modeName: string;
  currentHotkey: string;
  onClose: () => void;
  onSave: (hotkey: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(currentHotkey);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (!recording) return;

    const recordHotkey = (event: KeyboardEvent) => {
      event.preventDefault();
      if (
        event.key === "Escape" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        setRecording(false);
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (!accelerator?.includes("+")) return;
      setValue(accelerator);
      setRecording(false);
    };

    document.addEventListener("keydown", recordHotkey, true);
    return () => document.removeEventListener("keydown", recordHotkey, true);
  }, [recording]);

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      await onSave(value);
      onClose();
    } catch (err) {
      console.error(err);
      setSaveError(true);
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        if (recording) setRecording(false);
        else onClose();
      }}
    >
      <div
        className="modal-box w-[min(380px,calc(100vw-2rem))] p-5"
        aria-labelledby="hotkey-modal-title"
        aria-describedby="hotkey-modal-help"
      >
        <h3 id="hotkey-modal-title" className="text-base font-semibold">
          คีย์ลัด {modeName}
        </h3>
        <p id="hotkey-modal-help" className="mt-1 text-[13px] leading-relaxed text-base-content/65">
          กด “เปลี่ยน” แล้วกดคีย์ลัดชุดใหม่ จากนั้นบันทึก
        </p>
        <div className="mt-4 flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-base-300 bg-base-200 px-3 py-3">
          {recording ? (
            <span className="text-xs text-base-content/65">กดปุ่มที่ต้องการ (Esc ยกเลิก)</span>
          ) : (
            <HotkeyBadges hotkey={value} />
          )}
        </div>
        {saveError && (
          <div role="alert" className="mt-3 text-xs text-error">
            บันทึกไม่สำเร็จ กรุณาลองใหม่
          </div>
        )}
        <div className="modal-action mt-5">
          <button type="button" className={BTN} onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={BTN}
            disabled={recording || saving}
            onClick={() => setRecording(true)}
          >
            {recording ? "รอ..." : "เปลี่ยน"}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={recording || saving}
            onClick={() => void save()}
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
