import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, UserRound, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import Logo from "./Logo";
import Button from "./Button";
import { useAuth } from "../context/AuthContext";
const links = [{ label: "Explore vendors", to: "/vendors" }, { label: "Our services", to: "/services" }, { label: "How it works", to: "/#how-it-works" }];
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location]);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (e.key === "Escape") { setOpen(false); document.getElementById("navigation-toggle")?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const dashboard = user?.role === "admin" ? "/admin" : user?.role === "vendor" ? "/vendor/dashboard" : "/customer/dashboard";
  return <header className="sticky top-0 z-50 border-b border-ink/[0.07] bg-cream/95 backdrop-blur-md">
    <div className="container-shell flex h-16 items-center justify-between gap-4 md:h-20">
      <Logo />
      <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:gap-9 md:flex">
        {links.map(link => <NavLink key={link.label} to={link.to} className={({ isActive }) => `py-3 text-xs font-semibold transition hover:text-coral ${isActive && link.to !== "/#how-it-works" ? "text-coral" : "text-ink/65"}`}>{link.label}</NavLink>)}
      </nav>
      <div className="hidden items-center gap-2 md:flex">
        {isAuthenticated ? <Button to={dashboard} variant="outline"><UserRound className="h-4 w-4" />My account</Button> : <><Button to="/login" variant="ghost" className="!px-3">Log in</Button><Button to="/register?role=vendor" variant="dark" className="!hidden !text-xs lg:!inline-flex">For professionals <ArrowUpRight className="h-3.5 w-3.5" /></Button></>}
      </div>
      <div className="flex items-center gap-1 md:hidden"><NavLink to={isAuthenticated ? dashboard : "/login"} aria-label="My account" className="icon-button"><UserRound className="h-5 w-5" strokeWidth={1.7} /></NavLink><button id="navigation-toggle" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-controls="mobile-menu" aria-expanded={open} className="icon-button">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button></div>
    </div>
    {open && <nav id="mobile-menu" aria-label="Mobile menu" className="container-shell border-t bg-cream pb-5 pt-3 md:hidden">
      {links.map(link => <NavLink key={link.label} to={link.to} className="block rounded-xl px-2 py-3.5 text-sm font-semibold text-ink/75">{link.label}</NavLink>)}
      <div className="mt-3 flex gap-3">{isAuthenticated ? <Button to={dashboard}>My dashboard</Button> : <><Button to="/login" variant="outline">Log in</Button><Button to="/register?role=vendor">Join as a vendor</Button></>}</div>
    </nav>}
  </header>;
}
