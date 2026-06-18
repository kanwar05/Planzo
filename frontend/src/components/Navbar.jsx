import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import Logo from "./Logo";
import Button from "./Button";

const links = [
  { label: "Discover", to: "/vendors" },
  { label: "Services", to: "/services" },
  { label: "How it works", to: "/#how-it-works" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-ink/5 bg-cream/90 backdrop-blur-xl">
      <div className="container-shell flex h-20 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <NavLink key={link.label} to={link.to} className={({ isActive }) => `text-sm font-semibold transition hover:text-coral ${isActive ? "text-coral" : "text-ink/65"}`}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Button to="/login" variant="ghost">Log in</Button>
          <Button to="/register">Join PLANZO</Button>
        </div>
        <button onClick={() => setOpen(!open)} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm md:hidden" aria-label="Toggle navigation">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="container-shell border-t border-ink/5 py-5 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => <NavLink key={link.label} onClick={() => setOpen(false)} to={link.to} className="rounded-xl px-3 py-3 font-semibold text-ink/70 hover:bg-white">{link.label}</NavLink>)}
            <div className="mt-3 grid grid-cols-2 gap-3"><Button to="/login" variant="outline">Log in</Button><Button to="/register">Join PLANZO</Button></div>
          </div>
        </div>
      )}
    </header>
  );
}
