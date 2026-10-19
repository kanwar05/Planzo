import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

export default function Dialog({ open, onClose, title, description, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector("button")?.focus();
    const cancel = event => { event.preventDefault(); closeRef.current(); };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border bg-cream p-6 text-ink shadow-lift backdrop:bg-ink/50 sm:p-8">
    <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="font-editorial text-2xl">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="icon-button -mr-2 -mt-2"><X className="h-5 w-5" /></button></div>
    {description && <p id={descriptionId} className="mt-2 text-sm leading-6 text-ink/65">{description}</p>}
    <div className="mt-6">{children}</div>
    {footer && <div className="mt-6 flex flex-wrap justify-end gap-3 border-t pt-5">{footer}</div>}
  </dialog>;
}
