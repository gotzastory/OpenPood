import { type FormEvent, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { isElevenLabsProvider } from "../lib/elevenlabs";
import { icons } from "../lib/icons";
import { PAGE_TITLE } from "../lib/uiClasses";
import type { AppProfile } from "../types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Saves on every add/remove like the Dictionary page.
export function AppsPage() {
  const [profiles, setProfiles] = useState<AppProfile[] | null>(null);
  const [sttOnly, setSttOnly] = useState(false);
  const [processInput, setProcessInput] = useState("");
  const [polishInput, setPolishInput] = useState(true);
  const [toneInput, setToneInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([window.typeless.listAppProfiles(), window.typeless.getSettings()])
      .then(([next, settings]) => {
        if (!active) return;
        setProfiles(next);
        setSttOnly(isElevenLabsProvider(settings));
      })
      .catch((err: unknown) => {
        console.error(err);
        if (active) setError(errorMessage(err));
      });
    document.getElementById("content")?.focus({ preventScroll: true });
    return () => { active = false; };
  }, []);

  const save = async (next: AppProfile[]) => {
    try {
      setProfiles(await window.typeless.setAppProfiles(next));
      setError("");
      return true;
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      return false;
    }
  };

  const addProfile = async (event: FormEvent) => {
    event.preventDefault();
    const process = processInput.trim();
    if (!process || !profiles) return;
    if (await save([...profiles, { process, polish: polishInput, tone: toneInput.trim() }])) {
      setProcessInput("");
      setToneInput("");
      setPolishInput(true);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className={PAGE_TITLE}>แอป</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
          กำหนดว่าจะปรับข้อความด้วย AI ไหมและใช้โทนแบบไหนเมื่อวางในแต่ละแอป
          แอปที่ตรงกับโปรไฟล์จะใช้ค่านี้แทนสวิตช์ "ปรับข้อความด้วย AI" ในการตั้งค่า
        </p>
      </header>

      {sttOnly && (
        <div role="status" className="alert alert-warning alert-soft mb-4 text-sm">
          ผู้ให้บริการปัจจุบันถอดเสียงอย่างเดียว โปรไฟล์จะยังไม่มีผลจนกว่าจะเปลี่ยนผู้ให้บริการ
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-error alert-soft mb-4 text-sm">{error}</div>
      )}

      <fieldset className="fieldset rounded-box border border-base-300 bg-base-100 p-4" aria-labelledby="app-profiles-title">
        <legend id="app-profiles-title" className="fieldset-legend text-base font-semibold">โปรไฟล์ตามแอป</legend>
        <p className="label px-0 text-sm font-normal text-secondary">
          ใส่ชื่อโปรแกรมบางส่วนก็ได้ ตัวพิมพ์เล็กใหญ่ไม่มีผล ถ้าตรงหลายโปรไฟล์จะใช้อันบนสุด บันทึกทันที
        </p>

        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void addProfile(event)}>
          <label htmlFor="profile-process-input" className="label flex-col items-stretch px-0">
            ชื่อโปรแกรม
            <input
              id="profile-process-input"
              type="text"
              maxLength={64}
              value={processInput}
              onChange={(event) => setProcessInput(event.target.value)}
              placeholder="เช่น outlook, slack"
              className="input input-sm w-full"
            />
          </label>
          <label htmlFor="profile-tone-input" className="label flex-col items-stretch px-0">
            คำสั่งโทน
            <input
              id="profile-tone-input"
              type="text"
              maxLength={500}
              value={toneInput}
              onChange={(event) => setToneInput(event.target.value)}
              placeholder="เว้นว่าง = ใช้ค่าเริ่มต้น"
              className="input input-sm w-full"
            />
          </label>
          <label className="label cursor-pointer justify-start gap-3 px-0">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={polishInput}
              onChange={(event) => setPolishInput(event.target.checked)}
            />
            ปรับด้วย AI
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!profiles}>
              <Icon svg={icons.plus} />
              <span>เพิ่ม</span>
            </button>
          </div>
        </form>

        {profiles === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-secondary" role="status">
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            กำลังโหลด...
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-10 text-center text-sm text-secondary">ยังไม่มีโปรไฟล์ ทุกแอปใช้การตั้งค่าหลัก</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>โปรแกรม</th>
                  <th>การปรับ</th>
                  <th>โทน</th>
                  <th><span className="sr-only">ลบ</span></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.process}>
                    <td className="font-medium break-words">{profile.process}</td>
                    <td>
                      <span className={`badge badge-sm ${profile.polish ? "badge-primary badge-soft" : "badge-ghost"}`}>
                        {profile.polish ? "ปรับด้วย AI" : "ไม่ปรับ"}
                      </span>
                    </td>
                    <td className="break-words text-secondary">{profile.tone || "โทนค่าเริ่มต้น"}</td>
                    <td className="text-right">
                      <div className="tooltip tooltip-left" data-tip={`ลบ ${profile.process}`}>
                        <button
                          type="button"
                          aria-label={`ลบโปรไฟล์ ${profile.process}`}
                          className="btn btn-circle btn-ghost btn-sm min-h-8 w-8 [&_svg]:h-3 [&_svg]:w-3"
                          onClick={() => void save(profiles.filter((item) => item.process !== profile.process))}
                        >
                          <Icon svg={icons.x} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}
