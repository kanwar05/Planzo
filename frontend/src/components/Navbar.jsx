import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import Logo from "./Logo";
import Button from "./Button";
import { useAuth } from "../context/AuthContext";
const links = [{
  label: "Discover",
  to: "/vendors"
}, {
  label: "Services",
  to: "/services"
}, {
  label: "How it works",
  to: "/#how-it-works"
}];
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const {
    isAuthenticated,
    user
  } = useAuth();
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location]);
  const dashboard = user?.role === "admin" ? "/admin" : user?.role === "vendor" ? "/vendor/dashboard" : "/customer/dashboard";
  const accountLinks = isAuthenticated ? <Button to={dashboard}>Dashboard</Button> : <>
    <Button to="/login" variant="ghost">Log in</Button>
    <Button to="/register">Join Planzo</Button>
  </>;
  return <header className="sticky top-0 z-50 border-b border-ink/5 bg-cream/90 backdrop-blur-xl">
    <div className="container-shell flex h-20 items-center justify-between">
      <Logo />
      <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
        {links.map(link => <NavLink key={link.label} to={link.to} className="text-sm font-semibold text-ink/65 transition hover:text-coral">
          {link.label}
        </NavLink>)}
      </nav>
      <div className="hidden items-center gap-3 md:flex">
        {accountLinks}
      </div>
      <button type="button" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm md:hidden">
        {open ? <X /> : <Menu />}
      </button>
    </div>
    {open && <nav aria-label="Mobile navigation" className="container-shell space-y-3 border-t border-ink/5 py-5 md:hidden">
      {links.map(link => <NavLink key={link.label} to={link.to} className="block rounded-xl p-3 font-semibold text-ink/70">
        {link.label}
      </NavLink>)}
      <div className="flex gap-3">
        {accountLinks}
      </div>
    </nav>}
  </header>;
}
