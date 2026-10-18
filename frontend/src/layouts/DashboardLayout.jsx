import { CalendarDays, CalendarRange, LayoutDashboard, LogOut, Menu, Settings, Store, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { useAuth } from "../context/AuthContext";
const customerLinks = [["My bookings", "/customer/dashboard", CalendarDays], ["Browse vendors", "/vendors", Store], ["Account", "/settings", Settings]];
const vendorLinks = [["Booking requests", "/vendor/dashboard", CalendarDays], ["Business profile", "/vendor/profile-setup", Store], ["Availability", "/vendor/availability", CalendarRange], ["Account", "/vendor/settings", Settings]];
const adminLinks = [["Overview", "/admin", LayoutDashboard], ["Users", "/admin/users", Users], ["Vendor approvals", "/admin/vendors/unverified", Store], ["Bookings", "/admin/bookings", CalendarDays], ["Account", "/admin/settings", Settings]];
export default function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const {
    user,
    logout
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  const links = user?.role === "admin" ? adminLinks : user?.role === "vendor" ? vendorLinks : customerLinks;
  const signOut = async () => {
    try {
      await logout();
      navigate("/login", {
        replace: true
      });
    } catch {
      setError("Unable to log out. Please try again.");
    }
  };
  return <div className="min-h-screen bg-cream">
    <header className="flex h-20 items-center justify-between border-b bg-white px-4 sm:px-8 lg:hidden">
      <Logo />
      <button type="button" aria-label="Open sidebar" aria-expanded={open} onClick={() => setOpen(true)} className="rounded-xl p-3">
        <Menu />
      </button>
    </header>
    {open && <button type="button" aria-label="Close navigation overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/40 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink/8 bg-white p-5 shadow-soft transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between">
        <Logo />
        <button type="button" aria-label="Close sidebar" onClick={() => setOpen(false)} className="p-2 lg:hidden">
          <X />
        </button>
      </div>
      <nav aria-label="Dashboard navigation" className="mt-10 space-y-2">
        {links.map(([label, to, Icon]) => <NavLink key={to} end to={to} className={({
          isActive
        }) => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${isActive ? "bg-ink text-white" : "text-ink/55 hover:bg-sand"}`}>
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>)}
      </nav>
      <div className="mt-auto border-t pt-5">
        <p className="truncate font-bold">
          {user?.name}
        </p>
        <p className="mt-1 text-xs capitalize text-ink/50">{user?.role} account</p>
        <button type="button" onClick={signOut} className="mt-4 flex items-center gap-2 rounded-xl py-2 text-sm font-bold text-coral"><LogOut className="h-4 w-4" />Log out</button>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>}
      </div>
    </aside>
    <main className="min-w-0 p-4 sm:p-8 lg:ml-64 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <Outlet />
      </div>
    </main>
  </div>;
}
