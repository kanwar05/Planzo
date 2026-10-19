import { CalendarDays, Grid2X2, House, Search, UserRound } from "lucide-react";
import * as motion from "motion/react-m";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const textInputTypes = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
const isEditingText = () => {
  const element = document.activeElement;
  if (!element || element.readOnly || element.disabled || element.inputMode === "none") return false;
  return element.tagName === "TEXTAREA"
    || (element.tagName === "INPUT" && textInputTypes.has(element.type))
    || element.isContentEditable
    || Boolean(element.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'));
};

export default function MobileNavigation() {
  const { user, isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    let restingHeight = window.innerHeight;
    let restingWidth = window.innerWidth;
    let detectedKeyboard = false;
    let focusFrame;
    const resize = () => {
      if (Math.abs(window.innerWidth - restingWidth) > 40) {
        restingWidth = window.innerWidth;
        restingHeight = window.innerHeight;
      }
      const editing = isEditingText();
      // VisualViewport uses CSS pixels: normalize pinch zoom before measuring a keyboard.
      const visualHeight = viewport ? viewport.height * (viewport.scale || 1) : window.innerHeight;
      const visualKeyboard = window.innerHeight - visualHeight > 150;
      const resizedKeyboard = (editing || detectedKeyboard) && restingHeight - window.innerHeight > 150;
      detectedKeyboard = Boolean(visualKeyboard || resizedKeyboard);
      setKeyboardOpen(detectedKeyboard);
      if (!detectedKeyboard) restingHeight = window.innerHeight;
    };
    // focusout fires before focus has moved to the next element.
    const afterFocusMoves = () => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(resize);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    document.addEventListener("focusin", resize);
    document.addEventListener("focusout", afterFocusMoves);
    return () => {
      cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("focusin", resize);
      document.removeEventListener("focusout", afterFocusMoves);
    };
  }, []);
  if ((user && user.role !== "customer") || pathname.startsWith("/booking/") || keyboardOpen) return null;
  const links = [["Home", "/", House], ["Explore", "/vendors", Search], ["Services", "/services", Grid2X2], ["Bookings", "/customer/dashboard", CalendarDays], ["Profile", isAuthenticated ? "/settings" : "/login", UserRound]];
  return <nav aria-label="Customer navigation" className="fixed inset-x-0 bottom-0 z-40 border-t bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
    <div className="mx-auto grid h-[72px] max-w-lg grid-cols-5 px-2">
      {links.map(([label, to, Icon]) => <NavLink key={label} end={to === "/"} to={to} className={({ isActive }) => `relative flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${isActive ? "text-coral" : "text-ink/65"}`}>
        {({ isActive }) => <><span className="relative grid h-8 w-12 place-items-center">{isActive && <motion.span layoutId="customer-nav" className="absolute inset-0 rounded-full bg-coral/10" transition={{ type: "spring", stiffness: 400, damping: 35 }} />}<Icon aria-hidden="true" className="relative h-5 w-5" strokeWidth={isActive ? 2.2 : 1.7} /></span>{label}</>}
      </NavLink>)}
    </div>
  </nav>;
}
