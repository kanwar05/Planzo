import { useState, useEffect } from "react";
import { Menu, X, Bell } from "lucide-react";
import { NavLink } from "react-router-dom";
import Logo from "./Logo";
import Button from "./Button";
import NotificationsCenter from "./NotificationsCenter";
import { useAuth } from "../context/AuthContext";
import { getNotificationStats } from "../services/notificationService";

const links = [
  { label: "Discover", to: "/vendors" },
  { label: "Services", to: "/services" },
  { label: "How it works", to: "/#how-it-works" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { isAuthenticated, user } = useAuth();
  const dashboard =
    user?.role === "admin"
      ? "/admin"
      : user?.role === "vendor"
        ? "/vendor/dashboard"
        : "/customer/dashboard";

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadUnreadCount = async () => {
      try {
        const stats = await getNotificationStats();
        setUnreadCount(stats.unreadCount || 0);
      } catch {
        // Silently fail - notifications are not critical
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleNotificationsClose = () => {
    setNotificationsOpen(false);
    // Reload unread count when closing
    if (isAuthenticated) {
      getNotificationStats()
        .then((stats) => setUnreadCount(stats.unreadCount || 0))
        .catch(() => {});
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-ink/5 bg-cream/90 backdrop-blur-xl">
      <div className="container-shell flex h-20 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-semibold transition hover:text-coral ${isActive ? "text-coral" : "text-ink/65"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(true)}
                  className="relative rounded-full p-2 hover:bg-white"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs font-bold text-white">
                      {Math.min(unreadCount, 9)}
                    </span>
                  )}
                </button>
              </div>
              <Button to={dashboard}>Dashboard</Button>
            </>
          ) : (
            <>
              <Button to="/login" variant="ghost">
                Log in
              </Button>
              <Button to="/register">Join PLANZO</Button>
            </>
          )}
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm md:hidden"
          aria-label="Toggle navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="container-shell border-t border-ink/5 py-5 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <NavLink
                key={link.label}
                onClick={() => setOpen(false)}
                to={link.to}
                className="rounded-xl px-3 py-3 font-semibold text-ink/70 hover:bg-white"
              >
                {link.label}
              </NavLink>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => {
                      setOpen(false);
                      setNotificationsOpen(true);
                    }}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-coral bg-white px-4 py-3 font-semibold text-coral"
                  >
                    <Bell className="h-4 w-4" />
                    Notifications
                    {unreadCount > 0 && (
                      <span className="text-xs">({unreadCount})</span>
                    )}
                  </button>
                  <Button to={dashboard} className="col-span-2">
                    Dashboard
                  </Button>
                </>
              ) : (
                <>
                  <Button to="/login" variant="outline">
                    Log in
                  </Button>
                  <Button to="/register">Join PLANZO</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <NotificationsCenter
        isOpen={notificationsOpen}
        onClose={handleNotificationsClose}
      />
    </header>
  );
}
