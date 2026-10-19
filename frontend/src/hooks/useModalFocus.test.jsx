import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useModalFocus } from "./useModalFocus";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  const ref = useModalFocus(open, () => setOpen(false));
  return <main>
    <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
    {open && <div><section role="dialog" aria-modal="true" aria-label="Test dialog" tabIndex={-1} ref={ref}>
      <button type="button" onClick={() => setOpen(false)}>Close dialog</button>
      <input aria-label="Your city" />
      <button type="button" style={{ display: "none" }}>Hidden action</button>
      <button type="button" disabled tabIndex={0}>Disabled action</button>
      <button type="button" tabIndex={-1}>Programmatic action</button>
      <button type="button">Apply filters</button>
    </section></div>}
  </main>;
}

describe("useModalFocus", () => {
  it("isolates the background, contains focus, and restores its previous state after Escape", () => {
    const originalOverflow = document.body.style.overflow;
    const external = document.createElement("aside");
    external.setAttribute("aria-hidden", "false");
    external.setAttribute("inert", "existing");
    document.body.append(external);
    document.body.style.overflow = "clip";
    const { unmount } = render(<ModalHarness />);
    try {
      const trigger = screen.getByRole("button", { name: "Open dialog" });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "Test dialog" });
      const close = within(dialog).getByRole("button", { name: "Close dialog" });
      const apply = within(dialog).getByRole("button", { name: "Apply filters" });
      expect(close).toHaveFocus();
      expect(trigger).toHaveAttribute("inert");
      expect(trigger).toHaveAttribute("aria-hidden", "true");
      expect(external).toHaveAttribute("aria-hidden", "true");
      expect(document.body.style.overflow).toBe("hidden");
      trigger.focus();
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
      expect(apply).toHaveFocus();
      fireEvent.keyDown(apply, { key: "Tab" });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(trigger).not.toHaveAttribute("inert");
      expect(trigger).not.toHaveAttribute("aria-hidden");
      expect(external).toHaveAttribute("inert", "existing");
      expect(external).toHaveAttribute("aria-hidden", "false");
      expect(document.body.style.overflow).toBe("clip");
    } finally {
      unmount();
      external.remove();
      document.body.style.overflow = originalOverflow;
    }
  });

  it("restores external content and scroll state when an open dialog unmounts", () => {
    const originalOverflow = document.body.style.overflow;
    const external = document.createElement("aside");
    document.body.append(external);
    const { unmount } = render(<ModalHarness />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
      expect(external).toHaveAttribute("inert");
      unmount();
      expect(external).not.toHaveAttribute("inert");
      expect(external).not.toHaveAttribute("aria-hidden");
      expect(document.body.style.overflow).toBe(originalOverflow);
    } finally {
      unmount();
      external.remove();
      document.body.style.overflow = originalOverflow;
    }
  });
});
