import { useEffect, useRef } from "react";

export function useModalFocus(open, onClose) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(dialog?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]'
    ) || []).filter(element => {
      if (element.matches(":disabled") || (element.hasAttribute("tabindex") && element.tabIndex < 0) || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
      for (let node = element; node && node !== dialog; node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    });
    let lastFocus = controls()[0] || dialog;
    lastFocus.focus();

    // The dialog can live inside a page or drawer. Isolate every sibling
    // outside its ancestor branch without hiding any of its own ancestors.
    const background = [];
    for (let branch = dialog; branch.parentElement && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        background.push({ element: sibling, inert: sibling.getAttribute("inert"), hidden: sibling.getAttribute("aria-hidden") });
        sibling.setAttribute("inert", "");
        sibling.setAttribute("aria-hidden", "true");
      }
    }
    const containFocus = event => {
      if (dialog.contains(event.target)) {
        lastFocus = event.target;
      } else {
        const target = lastFocus.isConnected && !lastFocus.disabled ? lastFocus : controls()[0] || dialog;
        target.focus();
      }
    };
    const handleKey = event => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = controls();
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", containFocus);
      for (const { element, inert, hidden } of background) {
        if (inert === null) element.removeAttribute("inert");
        else element.setAttribute("inert", inert);
        if (hidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", hidden);
      }
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  return dialogRef;
}
