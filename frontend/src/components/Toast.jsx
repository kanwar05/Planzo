import { CheckCircle2, CircleAlert, X } from "lucide-react";

export default function Toast({ message, type = "success", onClose }) {
  if (!message) return null;

  const success = type === "success";
  const Icon = success ? CheckCircle2 : CircleAlert;

  return (
    <div
      className={`fixed right-4 top-24 z-[100] flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-lift ${
        success ? "border-sage/30" : "border-red-200"
      }`}
      role={success ? "status" : "alert"}
    >
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${success ? "text-[#356347]" : "text-red-700"}`} />
      <p className="flex-1 text-sm font-semibold text-ink/75">{message}</p>
      <button type="button" onClick={onClose} aria-label="Close notification" className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-sand">
        <X className="h-4 w-4 text-ink/65" />
      </button>
    </div>
  );
}
