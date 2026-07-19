import {
  Bell,
  CalendarDays,
  CalendarCheck2,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import NotificationsCenter from "../components/NotificationsCenter";
import { useAuth } from "../context/AuthContext";

const customerLinks = [
  { label: "Dashboard", to: "/customer/dashboard", icon: LayoutDashboard },
  { label: "Browse Vendors", to: "/vendors", icon: Store },
  {
    label: "Bookings",
    to: "/customer/dashboard?view=bookings",
    icon: CalendarDays,
  },
  { label: "Payments", to: "/customer/payments", icon: CreditCard },
  { label: "Favorites", to: "/customer/favorites", icon: Heart },
  {
    label: "Messages",
    to: "/messages",
    icon: MessageCircle,
  },
  { label: "Reviews", to: "/customer/dashboard?view=reviews", icon: Star },
  {
    label: "Notifications",
    to: "/customer/dashboard?view=notifications",
    icon: Bell,
  },
  { label: "Profile", to: "/customer/dashboard?view=profile", icon: UserRound },
  {
    label: "Settings",
    to: "/customer/dashboard?view=settings",
    icon: Settings,
  },
];

const vendorLinks = [
  { label: "Dashboard", to: "/vendor/dashboard", icon: LayoutDashboard },
  { label: "Bookings", to: "/vendor/dashboard?view=bookings", icon: CalendarDays },
  { label: "Availability", to: "/vendor/availability", icon: CalendarRange },
  { label: "Calendar", to: "/vendor/calendar", icon: CalendarCheck2 },
  { label: "Packages", to: "/vendor/profile-setup#packages", icon: Store },
  { label: "Portfolio", to: "/vendor/profile-setup#portfolio", icon: Store },
  { label: "Messages", to: "/vendor/messages", icon: MessageCircle },
  { label: "Reviews", to: "/vendor/dashboard?view=reviews", icon: Star },
  { label: "Analytics", to: "/vendor/dashboard?view=analytics", icon: LayoutDashboard },
  { label: "Payments", to: "/vendor/dashboard?view=payments", icon: CreditCard },
  { label: "Settings", to: "/vendor/profile-setup", icon: Settings },
  { label: "Verification", to: "/vendor/verification", icon: ShieldCheck },
];

const initials = (name = "PZ") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function DashboardLayout({ vendor = false }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const links = vendor ? vendorLinks : customerLinks;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const currentDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    navigate(
      query ? `/vendors?search=${encodeURIComponent(query)}` : "/vendors",
    );
  };

  const sidebar = (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 96 : 292 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="relative flex h-full flex-col border-r border-ink/8 bg-white/88 px-4 py-5 shadow-[18px_0_60px_rgba(36,23,42,0.06)] backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between gap-3 px-2">
        <div className={collapsed ? "hidden" : "block"}>
          <Logo />
        </div>
        {collapsed && (
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-sm font-extrabold text-white">
            PZ
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-10 w-10 place-items-center rounded-2xl text-ink/55 transition hover:bg-ink/5 lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="absolute -right-4 top-24 hidden h-8 w-8 place-items-center rounded-full border border-ink/10 bg-white text-ink/55 shadow-soft transition hover:text-ink lg:grid"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      <nav className="mt-10 space-y-1.5">
        {links.map(({ label, to, icon: Icon }) => {
          const isActive =
            location.pathname + location.search === to ||
            (to === "/customer/dashboard" &&
              location.pathname === "/customer/dashboard" &&
              !location.search) ||
            (to === "/vendor/dashboard" &&
              location.pathname === "/vendor/dashboard" &&
              !location.search) ||
            (to === "/vendors" && location.pathname === "/vendors") ||
            (to === "/customer/favorites" &&
              location.pathname === "/customer/favorites");

          return (
            <NavLink
              key={label}
              to={to}
              onClick={() => setOpen(false)}
              title={collapsed ? label : undefined}
              className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition duration-300 ${
                isActive
                  ? "bg-ink text-white shadow-lift"
                  : "text-ink/55 hover:-translate-y-0.5 hover:bg-ink/[0.04] hover:text-ink"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div
          className={`rounded-3xl border border-ink/8 bg-gradient-to-br from-white to-[#f7fbff] p-3 shadow-soft ${collapsed ? "grid place-items-center" : "flex items-center gap-3"}`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-coral to-plum text-sm font-extrabold text-white">
            {initials(user?.name)}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{user?.name}</p>
              <p className="truncate text-xs capitalize text-ink/45">
                {user?.role} account
              </p>
            </div>
          )}
        </div>
        <button
          onClick={signOut}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-ink/50 transition hover:bg-red-50 hover:text-red-600 ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </motion.aside>
  );

  return (
    <div className="min-h-screen bg-white text-ink">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(239,111,97,0.12),transparent_28%),radial-gradient(circle_at_82%_4%,rgba(87,33,79,0.10),transparent_24%),linear-gradient(180deg,#ffffff_0%,#fbfaf8_48%,#ffffff_100%)]" />

      <div
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block ${collapsed ? "lg:w-24" : "lg:w-[292px]"}`}
      >
        {sidebar}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="h-full w-[292px]"
              onClick={(event) => event.stopPropagation()}
            >
              {sidebar}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={collapsed ? "lg:pl-24" : "lg:pl-[292px]"}>
        <header className="sticky top-0 z-30 border-b border-ink/8 bg-white/78 px-4 py-4 backdrop-blur-2xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] items-center gap-4">
            <button
              onClick={() => setOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-ink/10 bg-white text-ink lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold sm:text-2xl">
                {greeting}, {user?.name || "there"} 👋
              </h1>
              <p className="mt-0.5 hidden text-sm font-medium text-ink/45 sm:block">
                {currentDate}
              </p>
            </div>

            {vendor && (
              <div className="hidden items-center gap-2 xl:flex">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-extrabold text-emerald-700">
                  <ShieldCheck className="h-4 w-4" /> Vendor verification
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-extrabold text-ink/65 shadow-[0_10px_30px_rgba(36,23,42,0.05)]">
                  <CalendarDays className="h-4 w-4 text-coral" /> Today's bookings
                </span>
              </div>
            )}

            {/* {!vendor && (
              <form
                onSubmit={submitSearch}
                className="hidden min-w-[220px] max-w-md flex-1 items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2.5 shadow-[0_10px_30px_rgba(36,23,42,0.05)] md:flex"
              >
                <Search className="h-4 w-4 text-ink/35" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search vendors"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-ink/35"
                />
              </form>
            )} */}

            {/* {!vendor && (
              <div className="hidden items-center gap-2 xl:flex">
                <button
                  type="button"
                  onClick={() => navigate("/vendors")}
                  className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm font-extrabold text-ink shadow-[0_10px_30px_rgba(36,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-coral/40 hover:text-coral"
                >
                  <Store className="h-4 w-4" /> Browse Vendors
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/vendors")}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-extrabold text-white shadow-lift transition hover:-translate-y-0.5 hover:bg-plum"
                >
                  <CalendarPlus className="h-4 w-4" /> New Booking
                </button>
              </div>
            )} */}

            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative grid h-11 w-11 place-items-center rounded-2xl border border-ink/10 bg-white text-ink shadow-[0_10px_30px_rgba(36,23,42,0.05)] transition hover:-translate-y-0.5 hover:text-coral"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-coral" />
            </button>

            <div className="group relative">
              <button className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-coral to-plum text-sm font-extrabold text-white shadow-lift">
                {initials(user?.name)}
              </button>
              <div className="invisible absolute right-0 top-14 w-56 translate-y-2 rounded-3xl border border-ink/8 bg-white p-2 opacity-0 shadow-lift transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      vendor
                        ? "/vendor/profile-setup"
                        : "/customer/dashboard?view=profile",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-ink/65 hover:bg-ink/5 hover:text-ink"
                >
                  <UserRound className="h-4 w-4" /> Profile
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-red-500 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        {!vendor && (
          <form
            onSubmit={submitSearch}
            className="border-b border-ink/8 bg-white/75 px-4 py-3 md:hidden"
          >
            <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-3">
              <Search className="h-4 w-4 text-ink/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vendors"
                className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-ink/35"
              />
            </div>
          </form>
        )}

        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <NotificationsCenter
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
