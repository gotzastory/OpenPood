import { useEffect, useRef, useState } from "react";
import { mountSettings } from "../pages/settings";

export function LegacySettings({ refreshKey }: { refreshKey: number }) {
  const pageRoot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const root = pageRoot.current;
    if (!root) return;

    let active = true;
    setError(false);
    void mountSettings(root)
      .then(() => {
        if (active) document.getElementById("content")?.focus({ preventScroll: true });
      })
      .catch((err: unknown) => {
        console.error(err);
        if (active) setError(true);
      });

    return () => {
      active = false;
      root.replaceChildren();
    };
  }, [refreshKey]);

  if (error) {
    return (
      <div role="alert" className="alert alert-error alert-soft mx-auto max-w-xl text-sm">
        เปิดหน้านี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
      </div>
    );
  }

  return <div ref={pageRoot} />;
}
