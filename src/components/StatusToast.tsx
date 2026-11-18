export function StatusToast({
  text,
  kind,
}: {
  text: string;
  kind: "idle" | "success" | "error";
}) {
  if (!text) return null;
  const tone =
    kind === "success" ? "alert-success" : kind === "error" ? "alert-error" : "alert-info";
  return (
    <div className="toast toast-end toast-top z-50">
      <div role="status" aria-live="polite" className={`alert alert-soft ${tone} text-sm`}>
        {kind === "idle" && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
        <span>{text}</span>
      </div>
    </div>
  );
}
