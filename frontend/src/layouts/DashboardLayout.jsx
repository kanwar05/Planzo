import { CalendarDays, LayoutDashboard, LogOut, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import Logo from "../components/Logo";

export default function DashboardLayout({ vendor = false }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const links = vendor
    ? [{ label: "Dashboard", to: "/vendor/dashboard", icon: LayoutDashboard }, { label: "Booking Requests", to: "/vendor/dashboard?view=requests", icon: CalendarDays }, { label: "Accepted Bookings", to: "/vendor/dashboard?view=accepted", icon: CalendarDays }, { label: "Profile", to: "/vendor/profile", icon: UserRound }, { label: "Portfolio", to: "/vendor/profile#portfolio", icon: UserRound }]
    : [{ label: "Overview", to: "/dashboard", icon: LayoutDashboard }, { label: "My Bookings", to: "/dashboard?view=bookings", icon: CalendarDays }, { label: "Booking Status", to: "/dashboard?view=status", icon: CalendarDays }, { label: "Profile Settings", to: "/dashboard?view=profile", icon: UserRound }];

  return (
    <div className="min-h-screen bg-[#f8f4ef] lg:grid lg:grid-cols-[270px_1fr]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[270px] border-r border-ink/8 bg-white p-5 transition lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between"><Logo /><button className="lg:hidden" onClick={() => setOpen(false)}><X /></button></div>
        <nav className="mt-10 space-y-2">
          {links.map(({ label, to, icon: Icon }) => <NavLink key={label} to={to} onClick={() => setOpen(false)} className={() => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${location.pathname + location.search === to || (to.endsWith("dashboard") && location.pathname === to) ? "bg-ink text-white shadow-lg" : "text-ink/55 hover:bg-sand/60 hover:text-ink"}`}><Icon className="h-5 w-5" />{label}</NavLink>)}
        </nav>
        <button className="absolute bottom-7 left-5 flex items-center gap-3 px-4 py-3 text-sm font-semibold text-ink/50"><LogOut className="h-5 w-5" /> Sign out</button>
      </aside>
      <div>
        <header className="flex h-20 items-center justify-between border-b border-ink/8 bg-white px-5 sm:px-8">
          <button onClick={() => setOpen(true)} className="lg:hidden"><Menu /></button>
          <div className="ml-auto flex items-center gap-3"><div className="text-right"><p className="text-sm font-bold">{vendor ? "Aarav Mehta" : "Riya Sharma"}</p><p className="text-xs text-ink/40">{vendor ? "Vendor account" : "Customer account"}</p></div><span className="grid h-10 w-10 place-items-center rounded-full bg-coral text-sm font-bold text-white">{vendor ? "AM" : "RS"}</span></div>
        </header>
        <main className="p-5 sm:p-8 lg:p-10"><Outlet /></main>
      </div>
    </div>
  );
}
