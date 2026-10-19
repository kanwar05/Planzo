import { ArrowUpRight, CalendarDays, CalendarRange, ChevronRight, LayoutDashboard, LogOut, Menu, Settings, Store, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import MobileNavigation from "../components/MobileNavigation";
import { useAuth } from "../context/AuthContext";
import { useModalFocus } from "../hooks/useModalFocus";
const customerLinks = [["My bookings", "/customer/dashboard", CalendarDays], ["Explore vendors", "/vendors", Store], ["My account", "/settings", Settings]];
const vendorLinks = [["Booking requests", "/vendor/dashboard", CalendarDays], ["Business profile", "/vendor/profile-setup", Store], ["Availability", "/vendor/availability", CalendarRange], ["My account", "/vendor/settings", Settings]];
const adminLinks = [["Overview", "/admin", LayoutDashboard], ["Users", "/admin/users", Users], ["Vendor approvals", "/admin/vendors/unverified", Store], ["Bookings", "/admin/bookings", CalendarDays], ["My account", "/admin/settings", Settings]];
export default function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mobileNavRef = useModalFocus(open, () => setOpen(false));
  useEffect(() => { setOpen(false); window.scrollTo?.(0, 0); }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = event => { if (event.matches) setOpen(false); };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const links = user?.role === "admin" ? adminLinks : user?.role === "vendor" ? vendorLinks : customerLinks;
  const workspace = user?.role === "admin" ? "Admin workspace" : user?.role === "vendor" ? "Partner workspace" : "Your planning space";
  const activeLabel = links.find(([, to]) => to === location.pathname)?.[0] || "My dashboard";
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true); setError("");
    try { await logout(); navigate("/login", { replace: true }); }
    catch { setError("Unable to log out. Please try again."); }
    finally { setSigningOut(false); }
  };
  const sidebar = <>
    <div className="flex items-center justify-between"><Logo />{open && <button type="button" aria-label="Close sidebar" onClick={() => setOpen(false)} className="icon-button lg:hidden"><X className="h-5 w-5" aria-hidden="true" /></button>}</div>
    <p className="eyebrow mt-8 !text-ink/65">{workspace}</p>
    <nav aria-label="Dashboard navigation" className="mt-4 space-y-1.5">{links.map(([label, to, Icon]) => <NavLink key={to} end to={to} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold transition ${isActive ? "bg-[#f1e3da] text-coral" : "text-ink/65 hover:bg-sand"}`}><Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.7} />{label}</NavLink>)}</nav>
    <div className="mt-8 rounded-2xl border bg-cream p-4"><p className="font-editorial text-lg">A little inspiration?</p><p className="mt-2 text-xs leading-6 text-ink/65">See who’s making celebrations happen.</p><NavLink to="/vendors" className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-coral">Explore Planzo <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></NavLink></div>
    <div className="mt-auto border-t pt-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sage text-sm font-bold text-[#356347]">{user?.name?.slice(0, 1)?.toUpperCase() || "P"}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{user?.name}</p><p className="mt-1 text-[10px] capitalize text-ink/65">{user?.role} account</p></div></div><button type="button" disabled={signingOut} onClick={signOut} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl text-xs font-semibold text-ink/65 disabled:opacity-50"><LogOut className="h-3.5 w-3.5" aria-hidden="true" />{signingOut ? "Logging out…" : "Log out"}</button>{error && <p role="alert" className="mt-2 text-xs leading-5 text-red-800">{error}</p>}</div>
  </>;
  return <div className={`min-h-screen bg-cream ${user?.role === "customer" ? "mobile-nav-space" : ""}`}>
    <a href="#dashboard-content" className="skip-link">Skip to content</a>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-cream/95 px-5 backdrop-blur-md lg:hidden"><Logo /><button type="button" aria-label="Open sidebar" aria-controls="workspace-sidebar" aria-expanded={open} onClick={() => setOpen(true)} className="icon-button"><Menu className="h-5 w-5" aria-hidden="true" /></button></header>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-2 overflow-y-auto overscroll-y-contain border-r bg-white px-5 py-7 lg:flex">{sidebar}</aside>
    {open && <div className="fixed inset-0 z-[70] bg-ink/40 lg:hidden" onClick={() => setOpen(false)}><aside id="workspace-sidebar" role="dialog" aria-modal="true" aria-label={workspace} tabIndex={-1} ref={mobileNavRef} onClick={e => e.stopPropagation()} className="absolute inset-y-0 left-0 flex w-[min(288px,85vw)] flex-col gap-2 overflow-y-auto overscroll-y-contain bg-white px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lift">{sidebar}</aside></div>}
    <div className="lg:ml-64"><header className="hidden h-20 items-center justify-between gap-4 border-b bg-white/60 px-10 lg:flex"><div className="flex items-center gap-2 text-xs text-ink/65"><span>{workspace}</span><ChevronRight className="h-3 w-3" aria-hidden="true" /><span className="font-semibold text-ink">{activeLabel}</span></div><span className="rounded-full border bg-cream px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink/65">{user?.role === "customer" ? "Let’s make memories" : "A space to make things happen"}</span></header><main id="dashboard-content" tabIndex={-1} className="dashboard-content min-w-0 px-4 py-7 outline-none sm:p-8 lg:p-10"><div className="mx-auto max-w-6xl"><Outlet /></div></main></div>
    <MobileNavigation />
  </div>;
}
