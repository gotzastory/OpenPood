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
    <div className="mx-auto max-w-[920px]">
      <header className="mb-6">
        <h1 className={PAGE_TITLE}>แอป</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-base-content/65">
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

      <section className="card card-border bg-base-100" aria-labelledby="app-profiles-title">
        <div className="card-body gap-4 p-5">
          <div>
            <h2 id="app-profiles-title" className="text-sm font-semibold">โปรไฟล์ตามแอป</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-base-content/65">
              ใส่ชื่อโปรแกรมบางส่วนก็ได้ ตัวพิมพ์เล็กใหญ่ไม่มีผล ถ้าตรงหลายโปรไฟล์จะใช้อันบนสุด บันทึกทันที
            </p>
          </div>

          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto_minmax(0,1fr)_auto] sm:items-center"
            onSubmit={(event) => void addProfile(event)}
          >
            <label htmlFor="profile-process-input" className="sr-only">ชื่อโปรแกรม</label>
            <input
              id="profile-process-input"
              type="text"
              maxLength={64}
              value={processInput}
              onChange={(event) => setProcessInput(event.target.value)}
              placeholder="เช่น outlook, slack"
              className="input input-sm min-w-0"
            />
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-base-content/75">
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={polishInput}
                onChange={(event) => setPolishInput(event.target.checked)}
              />
              ปรับด้วย AI
            </label>
            <label htmlFor="profile-tone-input" className="sr-only">คำสั่งโทน</label>
            <input
              id="profile-tone-input"
              type="text"
              maxLength={500}
              value={toneInput}
              onChange={(event) => setToneInput(event.target.value)}
              placeholder="คำสั่งโทน (เว้นว่าง = ใช้ค่าเริ่มต้น)"
              className="input input-sm min-w-0"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!profiles}>
              <Icon svg={icons.plus} />
              <span>เพิ่ม</span>
            </button>
          </form>

          <ul className="list rounded-xl border border-base-300 bg-base-100">
            {profiles === null ? (
              <li className="py-10 text-center text-sm text-base-content/65">กำลังโหลด...</li>
            ) : profiles.length === 0 ? (
              <li className="py-10 text-center text-sm text-base-content/65">ยังไม่มีโปรไฟล์ ทุกแอปใช้การตั้งค่าหลัก</li>
            ) : (
              profiles.map((profile) => (
                <li
                  key={profile.process}
                  className="list-row items-center gap-3 border-b border-base-200 px-3.5 py-2.5 text-[13px] last:border-b-0"
                >
                  <span className="min-w-0 break-words font-medium">{profile.process}</span>
                  <span className={`badge badge-sm ${profile.polish ? "badge-primary badge-soft" : "badge-ghost"}`}>
                    {profile.polish ? "ปรับด้วย AI" : "ไม่ปรับ"}
                  </span>
                  <span className="list-col-grow min-w-0 break-words text-base-content/65">
                    {profile.tone || "โทนค่าเริ่มต้น"}
                  </span>
                  <button
                    type="button"
                    aria-label={`ลบโปรไฟล์ ${profile.process}`}
                    className="btn btn-circle btn-ghost btn-sm min-h-8 w-8 [&_svg]:h-3 [&_svg]:w-3"
                    onClick={() => void save(profiles.filter((item) => item.process !== profile.process))}
                  >
                    <Icon svg={icons.x} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
