import { CheckCircle2, CircleAlert, X } from "lucide-react";

export default function Toast({ message, type = "success", onClose }) {
  if (!message) return null;

  const success = type === "success";
  const Icon = success ? CheckCircle2 : CircleAlert;

  return (
    <div
      className={`fixed right-4 top-24 z-[100] flex max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-lift ${
        success ? "border-sage/30" : "border-red-200"
      }`}
      role="status"
    >
      <Icon className={`mt-0.5 h-5 w-5 ${success ? "text-sage" : "text-red-500"}`} />
      <p className="flex-1 text-sm font-semibold text-ink/75">{message}</p>
      <button type="button" onClick={onClose} aria-label="Close notification">
        <X className="h-4 w-4 text-ink/35" />
      </button>
    </div>
  );
}
