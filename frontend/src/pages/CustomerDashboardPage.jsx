import {
  Bell,
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  Shield,
  Sparkles,
  Star,
  Store,
  Trash2,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ReviewForm from "../components/ReviewForm";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  changePassword,
  deleteAccount,
  updateNotificationPreferences,
  updateProfile,
} from "../services/authService";
import { cancelBookingRequest, getMyBookings } from "../services/bookingService";
import { getFavorites } from "../services/favoriteService";
import {
  createReview,
  deleteReview,
  getBookingReview,
  updateReview,
} from "../services/reviewService";
import { getCustomerDashboard } from "../services/dashboardService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

const statusClass = {
  accepted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  completed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  rejected: "bg-red-50 text-red-600 ring-1 ring-red-100",
  cancelled: "bg-ink/5 text-ink/45 ring-1 ring-ink/10",
};

const settingsTabs = [
  ["Personal Information", UserRound],
  ["Security", LockKeyhole],
  ["Notifications", Bell],
  ["Privacy", Shield],
];

const eventSteps = ["Venue", "Decoration", "Photography", "Catering"];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const initials = (name = "PZ") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const bookingTime = (booking) =>
  booking.eventStartTime && booking.eventEndTime
    ? `${booking.eventStartTime} - ${booking.eventEndTime}`
    : "Time pending";

const daysUntil = (date) => {
  const diff =
    new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
};

function PremiumCard({ children, className = "", delay = 0 }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.45, delay }}
      whileHover={{ y: -4 }}
      className={`rounded-2xl border border-ink/8 bg-white shadow-[0_18px_60px_rgba(36,23,42,0.08)] transition-shadow hover:shadow-lift ${className}`}
    >
      {children}
    </motion.section>
  );
}

function Sparkline({ tone = "coral" }) {
  const stroke =
    tone === "green" ? "#16a34a" : tone === "blue" ? "#2563eb" : "#ef6f61";
  return (
    <svg viewBox="0 0 92 28" className="h-8 w-24" aria-hidden="true">
      <path
        d="M2 22 C 14 8, 22 19, 32 12 S 50 4, 60 12 S 76 23, 90 7"
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniCalendar({ bookings }) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const eventDays = new Set(
    bookings
      .filter((booking) => booking.eventDate)
      .map((booking) => new Date(booking.eventDate).getDate()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-extrabold">
          {today.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <CalendarDays className="h-5 w-5 text-coral" />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold uppercase text-ink/35">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: first.getDay() }).map((_, index) => (
          <span key={`empty-${index}`} className="aspect-square" />
        ))}
        {Array.from({ length: days }).map((_, index) => {
          const day = index + 1;
          const active = eventDays.has(day);
          const current = day === today.getDate();
          return (
            <span
              key={day}
              className={`grid aspect-square place-items-center rounded-xl text-xs font-bold ${
                active
                  ? "bg-ink text-white"
                  : current
                    ? "bg-coral/10 text-coral"
                    : "text-ink/55 hover:bg-ink/5"
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function CustomerDashboardPage() {
  useDocumentTitle("Customer Dashboard - Planzo");
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [reviewsByBooking, setReviewsByBooking] = useState({});
  const [reviewBooking, setReviewBooking] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [settingsTab, setSettingsTab] = useState("Personal Information");
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });
  const [notificationForm, setNotificationForm] = useState({
    bookingUpdates: true,
    reviewReminders: true,
    promotions: false,
  });
  const [settingsSaving, setSettingsSaving] = useState("");

  useEffect(() => {
    Promise.allSettled([
      getMyBookings(),
      getFavorites(),
      getCustomerDashboard({ limit: 8 }),
    ])
      .then(async ([bookingsResult, favoritesResult, dashboardResult]) => {
        if (bookingsResult.status === "fulfilled") {
          const items = bookingsResult.value;
          setBookings(items);

          const completed = items.filter((item) => item.status === "completed");
          const reviews = await Promise.allSettled(
            completed.map((item) => getBookingReview(item._id)),
          );
          setReviewsByBooking(
            Object.fromEntries(
              completed.map((item, index) => [
                item._id,
                reviews[index].status === "fulfilled"
                  ? reviews[index].value
                  : null,
              ]),
            ),
          );
        } else {
          setError(
            getApiError(bookingsResult.reason, "Unable to load your bookings."),
          );
        }

        if (favoritesResult.status === "fulfilled") {
          setFavorites(favoritesResult.value);
        }

        if (dashboardResult.status === "fulfilled") {
          setDashboard(dashboardResult.value);
        } else if (!error) {
          setError(
            getApiError(
              dashboardResult.reason,
              "Unable to load dashboard analytics.",
            ),
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setNotificationForm({
      bookingUpdates: user?.notificationPreferences?.bookingUpdates ?? true,
      reviewReminders: user?.notificationPreferences?.reviewReminders ?? true,
      promotions: user?.notificationPreferences?.promotions ?? false,
    });
  }, [user]);

  const stats = useMemo(() => {
    const upcoming = (dashboard?.bookingTimeline?.length
      ? dashboard.bookingTimeline
      : bookings
    )
      .filter(
        (booking) =>
          ["pending", "accepted"].includes(booking.status) &&
          new Date(booking.eventDate) >= new Date(),
      )
      .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

    return {
      active: bookings.filter((booking) =>
        ["pending", "accepted"].includes(booking.status),
      ).length,
      total: dashboard?.summary?.totalBookings ?? bookings.length,
      upcoming,
      completed:
        dashboard?.summary?.completedBookings ??
        bookings.filter((booking) => booking.status === "completed").length,
      pending: bookings.filter((booking) => booking.status === "pending")
        .length,
      cancelled:
        dashboard?.summary?.cancelledBookings ??
        bookings.filter((booking) => booking.status === "cancelled").length,
      favoriteVendors: dashboard?.summary?.favoriteVendors ?? favorites.length,
      pendingPayments: dashboard?.summary?.pendingPayments ?? 0,
      totalBudget: bookings.reduce(
        (sum, booking) => sum + (Number(booking.budget) || 0),
        0,
      ),
      spent: bookings
        .filter((booking) => ["accepted", "completed"].includes(booking.status))
        .reduce((sum, booking) => sum + (Number(booking.budget) || 0), 0),
    };
  }, [bookings, dashboard, favorites.length]);

  const reviewsGiven = useMemo(
    () => Object.values(reviewsByBooking).filter(Boolean),
    [reviewsByBooking],
  );

  const favoriteVendors = useMemo(
    () => favorites.map((favorite) => favorite.vendorId).filter(Boolean),
    [favorites],
  );

  const recommendedVendors = useMemo(() => {
    const booked = bookings.map((booking) => booking.vendorId).filter(Boolean);
    const combined = [...favoriteVendors, ...booked];
    return combined.filter(
      (vendor, index, list) =>
        vendor?._id &&
        list.findIndex((item) => item?._id === vendor._id) === index,
    );
  }, [bookings, favoriteVendors]);

  const nextBooking = stats.upcoming[0] || bookings[0];
  const totalBudget = stats.totalBudget;
  const spent = stats.spent;
  const remaining = Math.max(totalBudget - spent, 0);
  const budgetPercent = Math.min(
    Math.round((spent / Math.max(totalBudget, 1)) * 100),
    100,
  );

  const cancelBooking = async (id) => {
    const reason = window.prompt("Why are you cancelling this booking?");
    if (!reason?.trim()) return;
    setUpdatingId(id);
    setError("");
    try {
      const { booking: updated } = await cancelBookingRequest(id, reason.trim());
      setBookings((current) =>
        current.map((booking) => (booking._id === id ? updated : booking)),
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to cancel this booking."));
    } finally {
      setUpdatingId("");
    }
  };

  const saveReview = async (data) => {
    setSavingReview(true);
    setError("");
    try {
      const existing = reviewsByBooking[reviewBooking._id];
      const review = existing
        ? await updateReview(existing._id, data)
        : await createReview({ ...data, bookingId: reviewBooking._id });

      setReviewsByBooking((current) => ({
        ...current,
        [reviewBooking._id]: review,
      }));
      setReviewBooking(null);
      setSuccess(existing ? "Review updated." : "Review published.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to save your review."));
    } finally {
      setSavingReview(false);
    }
  };

  const removeReview = async (bookingId) => {
    const review = reviewsByBooking[bookingId];
    if (!review || !window.confirm("Delete this review permanently?")) return;

    setUpdatingId(review._id);
    setError("");
    try {
      await deleteReview(review._id);
      setReviewsByBooking((current) => ({ ...current, [bookingId]: null }));
      setSuccess("Review deleted.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to delete this review."));
    } finally {
      setUpdatingId("");
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSettingsSaving("profile");
    setError("");
    setSuccess("");

    try {
      const updatedUser = await updateProfile(profileForm);
      updateUser(updatedUser);
      setSuccess("Profile updated.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to update profile."));
    } finally {
      setSettingsSaving("");
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setSettingsSaving("password");
    setError("");
    setSuccess("");

    const form = new FormData(event.currentTarget);

    try {
      await changePassword({
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
      });
      updateUser(null);
      setSuccess("Password changed. Please log in again.");
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to change password."));
    } finally {
      setSettingsSaving("");
    }
  };

  const saveNotifications = async (event) => {
    event.preventDefault();
    setSettingsSaving("notifications");
    setError("");
    setSuccess("");

    try {
      const updatedUser = await updateNotificationPreferences(notificationForm);
      updateUser(updatedUser);
      setSuccess("Notification preferences updated.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to update notifications."));
    } finally {
      setSettingsSaving("");
    }
  };

  const removeAccount = async (event) => {
    event.preventDefault();
    setSettingsSaving("delete");
    setError("");
    setSuccess("");

    const form = new FormData(event.currentTarget);

    try {
      await deleteAccount(form.get("password"));
      updateUser(null);
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to delete account."));
    } finally {
      setSettingsSaving("");
    }
  };

  const statCards = [
    [CalendarCheck, "Total Bookings", stats.total, "", "green"],
    [CalendarClock, "Upcoming Events", stats.upcoming.length, "", "blue"],
    [Check, "Completed", stats.completed, "", "green"],
    [Trash2, "Cancelled", stats.cancelled, "", "coral"],
  ];

  const activity = (dashboard?.recentNotifications || []).map(
    (notification) => notification.title,
  );

  const messages = dashboard?.recentChats || [];
  const bookingProgressPercent =
    nextBooking?.status === "completed"
      ? 100
      : nextBooking?.status === "accepted"
        ? 68
        : nextBooking?.status === "pending"
          ? 34
          : 0;

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div>
      <Toast
        message={error || success}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setSuccess("");
        }}
      />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="space-y-8"
      >
        <motion.section
          variants={fadeUp}
          className="relative overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-[#fff8f5] via-white to-[#eef7ff] p-6 shadow-lift sm:p-8 lg:p-10"
        >
          <div className="absolute right-6 top-6 hidden h-48 w-48 rounded-full bg-coral/10 blur-3xl lg:block" />
          <div className="absolute bottom-0 right-0 hidden h-80 w-80 translate-x-20 translate-y-20 rounded-full bg-sage/15 blur-3xl lg:block" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-extrabold uppercase text-coral shadow-soft backdrop-blur">
                <Sparkles className="h-4 w-4" /> Customer Dashboard
              </div>
              <h2 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
                Plan your next celebration with every detail in view.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-ink/55">
                Track bookings, vendors, budgets, messages, reviews, and
                reminders from one polished command center.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button to="/vendors">
                  <Store className="h-4 w-4" /> Browse Vendors
                </Button>
                <Button to="/vendors" variant="dark">
                  <CalendarPlus className="h-4 w-4" /> New Booking
                </Button>
                <Button to="/customer/favorites" variant="outline">
                  <Heart className="h-4 w-4" /> Favorites
                </Button>
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/70 bg-white/68 p-4 shadow-soft backdrop-blur-xl sm:grid-cols-2">
              {[
                ["Upcoming Events", stats.upcoming.length, CalendarDays],
                ["Active Bookings", stats.active, CalendarCheck],
                ["Favorite Vendors", stats.favoriteVendors, Heart],
                ["Quick Actions", 5, Sparkles],
              ].map(([label, value, Icon]) => (
                <motion.div
                  key={label}
                  whileHover={{ scale: 1.03 }}
                  className="rounded-2xl border border-ink/8 bg-white p-4"
                >
                  <Icon className="h-5 w-5 text-coral" />
                  <p className="mt-4 text-3xl font-extrabold">{value}</p>
                  <p className="mt-1 text-sm font-bold text-ink/45">{label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(([Icon, title, value, trend, tone], index) => (
            <PremiumCard key={title} delay={index * 0.04} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink/[0.04] text-coral">
                  <Icon className="h-5 w-5" />
                </span>
                {trend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                    <TrendingUp className="h-3 w-3" /> {trend}
                  </span>
                ) : null}
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-extrabold">{value}</p>
                  <p className="mt-1 text-sm font-bold text-ink/45">{title}</p>
                </div>
                <Sparkline tone={tone} />
              </div>
            </PremiumCard>
          ))}
        </section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_410px]">
          <main className="space-y-8">
            <PremiumCard className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/8 p-6">
                <div>
                  <h2 className="text-2xl font-extrabold">Upcoming Events</h2>
                  <p className="mt-1 text-sm text-ink/45">
                    Timeline of active bookings and event dates.
                  </p>
                </div>
                <Button to="/vendors" variant="outline">
                  <Search className="h-4 w-4" /> Explore vendors
                </Button>
              </div>
              {stats.upcoming.length ? (
                <div className="p-6">
                  <div className="relative space-y-4 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-ink/10">
                    {stats.upcoming.slice(0, 5).map((booking) => (
                      <article
                        key={booking._id}
                        className="relative flex gap-4 rounded-2xl border border-ink/8 bg-white p-4 shadow-[0_12px_34px_rgba(36,23,42,0.05)]"
                      >
                        <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ink text-white">
                          <CalendarCheck className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-extrabold">
                                {booking.eventType || "Event"}
                              </h3>
                              <p className="mt-1 text-sm font-semibold text-ink/55">
                                {booking.vendorId?.businessName ||
                                  "Vendor unavailable"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-extrabold capitalize ${statusClass[booking.status] || statusClass.pending}`}
                            >
                              {booking.status}
                            </span>
                            {booking.status === "cancelled" && <p className="mt-1 text-xs text-ink/45">Refund: {(booking.refundStatus || "not applicable").replaceAll("_", " ")}{booking.refundAmount ? ` · ${formatCurrency(booking.refundAmount / 100)}` : ""}</p>}
                          </div>
                          <div className="mt-4 grid gap-3 text-sm text-ink/55 sm:grid-cols-4">
                            <span>{formatDate(booking.eventDate)}</span>
                            <span>{bookingTime(booking)}</span>
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />{" "}
                              {booking.eventLocation || "Venue pending"}
                            </span>
                            <span className="font-extrabold text-coral">
                              {daysUntil(booking.eventDate)}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState
                    title="No upcoming bookings"
                    description="Browse vendors and send a request when you're ready."
                    actionLabel="Find vendors"
                    actionTo="/vendors"
                  />
                </div>
              )}
            </PremiumCard>

            <section className="grid gap-8 lg:grid-cols-2">
              <PremiumCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold">
                      Booking Progress
                    </h2>
                    <p className="mt-1 text-sm text-ink/45">
                      {nextBooking?.eventType || "Wedding"} planning flow
                    </p>
                  </div>
                  <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-extrabold text-coral">
                    {bookingProgressPercent}%
                  </span>
                </div>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-ink/6">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${bookingProgressPercent}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full rounded-full bg-gradient-to-r from-coral to-plum"
                  />
                </div>
                <div className="mt-6 grid gap-3">
                  {eventSteps.map((step, index) => {
                    const done =
                      index < 2 ||
                      ["accepted", "completed"].includes(nextBooking?.status);
                    return (
                      <div
                        key={step}
                        className="flex items-center justify-between rounded-2xl border border-ink/8 p-3"
                      >
                        <span className="font-bold">{step}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                        >
                          {done ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Clock3 className="h-3 w-3" />
                          )}
                          {done ? "Done" : "Pending"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <h2 className="text-2xl font-extrabold">Budget Tracker</h2>
                <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
                  <motion.div
                    initial={{ "--p": "0%" }}
                    animate={{ "--p": `${budgetPercent}%` }}
                    transition={{ duration: 0.8 }}
                    className="grid h-40 w-40 shrink-0 place-items-center rounded-full"
                    style={{
                      background: `conic-gradient(#ef6f61 var(--p), #f1f5f9 0)`,
                    }}
                  >
                    <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
                      <span>
                        <span className="block text-3xl font-extrabold">
                          {budgetPercent}%
                        </span>
                        <span className="text-xs font-bold text-ink/40">
                          spent
                        </span>
                      </span>
                    </div>
                  </motion.div>
                  <div className="grid flex-1 gap-3">
                    {[
                      ["Budget", totalBudget, "text-ink"],
                      ["Spent", spent, "text-coral"],
                      ["Remaining", remaining, "text-emerald-700"],
                      ["Pending Payments", stats.pendingPayments, "text-blue-700"],
                    ].map(([label, value, color]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between rounded-2xl bg-ink/[0.03] px-4 py-3"
                      >
                        <span className="text-sm font-bold text-ink/45">
                          {label}
                        </span>
                        <span className={`font-extrabold ${color}`}>
                          {formatCurrency(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </PremiumCard>
            </section>

            <PremiumCard className="overflow-hidden">
              <div className="flex items-center justify-between gap-4 p-6">
                <div>
                  <h2 className="text-2xl font-extrabold">
                    Recommended Vendors
                  </h2>
                  <p className="mt-1 text-sm text-ink/45">
                    Personalized from your favorites and booking history.
                  </p>
                </div>
                <Button
                  to="/vendors"
                  variant="ghost"
                  className="hidden sm:inline-flex"
                >
                  View all <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {recommendedVendors.length ? (
                <div className="flex gap-4 overflow-x-auto px-6 pb-6">
                  {recommendedVendors.slice(0, 8).map((vendor) => (
                    <motion.article
                      key={vendor._id}
                      whileHover={{ y: -6 }}
                      className="w-72 shrink-0 overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-[0_14px_40px_rgba(36,23,42,0.07)]"
                    >
                      <div className="relative h-40">
                        <img
                          src={getVendorImage(vendor)}
                          alt={vendor.businessName}
                          className="h-full w-full object-cover"
                        />
                        <button
                          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-coral shadow-soft backdrop-blur"
                          aria-label="Save vendor"
                        >
                          <Heart className="h-4 w-4 fill-current" />
                        </button>
                        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-emerald-700 backdrop-blur">
                          Verified
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-extrabold">
                              {vendor.businessName}
                            </h3>
                            <p className="mt-1 text-sm text-ink/45">
                              {vendor.serviceCategory ||
                                vendor.category ||
                                "Event vendor"}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-sm font-extrabold">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            {vendor.averageRating || vendor.rating || "New"}
                          </span>
                        </div>
                        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink/50">
                          <MapPin className="h-4 w-4" />{" "}
                          {vendor.location || "Location flexible"}
                        </p>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-sm font-extrabold">
                            {formatCurrency(
                              vendor.pricing ?? vendor.startingPrice ?? 0,
                            )}
                          </span>
                          <Button
                            to={`/booking/${vendor._id}`}
                            className="!px-4 !py-2"
                          >
                            Book Now
                          </Button>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              ) : (
                <div className="px-6 pb-6">
                  <EmptyState
                    title="No recommendations yet"
                    description="Save vendors or create bookings to personalize this carousel."
                    actionLabel="Browse vendors"
                    actionTo="/vendors"
                  />
                </div>
              )}
            </PremiumCard>

            <PremiumCard className="overflow-hidden">
              <div className="border-b border-ink/8 p-6">
                <h2 className="text-2xl font-extrabold">Booking History</h2>
                <p className="mt-1 text-sm text-ink/45">
                  All requests, statuses, cancellation controls, and review
                  actions.
                </p>
              </div>
              {bookings.length ? (
                <div className="overflow-x-auto">
                  <table className="hidden min-w-full text-left text-sm md:table">
                    <thead className="bg-slate-50 text-xs uppercase text-ink/40">
                      <tr>
                        <th className="px-5 py-4">Vendor</th>
                        <th className="px-5 py-4">Event</th>
                        <th className="px-5 py-4">Date</th>
                        <th className="px-5 py-4">Budget</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/8">
                      {bookings.map((booking) => (
                        <tr key={booking._id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={getVendorImage(booking.vendorId)}
                                alt={booking.vendorId?.businessName || "Vendor"}
                                className="h-11 w-11 rounded-2xl object-cover"
                              />
                              <span className="font-extrabold">
                                {booking.vendorId?.businessName ||
                                  "Vendor unavailable"}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-ink/55">
                            {booking.eventType}
                          </td>
                          <td className="px-5 py-4 text-ink/55">
                            {formatDate(booking.eventDate)} ·{" "}
                            {bookingTime(booking)}
                          </td>
                          <td className="px-5 py-4 font-bold">
                            {formatCurrency(booking.budget || 0)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass[booking.status] || statusClass.pending}`}
                            >
                              {booking.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end gap-3">
                              <Link
                                to={`/bookings/${booking._id}/payment`}
                                className="text-xs font-extrabold text-coral hover:text-coral/75"
                              >
                                Payment details
                              </Link>
                              <Link to={`/messages?bookingId=${booking._id}`} className="text-xs font-extrabold text-plum hover:text-plum/75">Chat</Link>
                              {booking.vendorId?._id && (
                                <Link
                                  to={`/vendors/${booking.vendorId._id}`}
                                  className="text-xs font-extrabold text-ink/50 hover:text-coral"
                                >
                                  View
                                </Link>
                              )}
                              {["pending", "accepted"].includes(
                                booking.status,
                              ) && (
                                <button
                                  type="button"
                                  disabled={updatingId === booking._id}
                                  onClick={() => cancelBooking(booking._id)}
                                  className="text-xs font-extrabold text-red-500 disabled:opacity-50"
                                >
                                  {updatingId === booking._id
                                    ? "Cancelling"
                                    : "Cancel"}
                                </button>
                              )}
                              {booking.status === "completed" &&
                                (reviewsByBooking[booking._id] ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setReviewBooking(booking)}
                                      className="text-xs font-extrabold text-coral"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        updatingId ===
                                        reviewsByBooking[booking._id]._id
                                      }
                                      onClick={() => removeReview(booking._id)}
                                      className="text-xs font-extrabold text-red-500 disabled:opacity-50"
                                    >
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setReviewBooking(booking)}
                                    className="text-xs font-extrabold text-coral"
                                  >
                                    Review
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="grid gap-4 p-5 md:hidden">
                    {bookings.map((booking) => (
                      <article
                        key={booking._id}
                        className="rounded-2xl border border-ink/8 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={getVendorImage(booking.vendorId)}
                            alt={booking.vendorId?.businessName || "Vendor"}
                            className="h-12 w-12 rounded-2xl object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-extrabold">
                              {booking.vendorId?.businessName ||
                                "Vendor unavailable"}
                            </p>
                            <p className="text-sm text-ink/45">
                              {booking.eventType}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm">
                              {formatDate(booking.eventDate)}
                            </p>
                            <p className="font-bold">
                              {formatCurrency(booking.budget || 0)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusClass[booking.status] || statusClass.pending}`}
                          >
                            {booking.status}
                          </span>
                        </div>
                        <Link
                          to={`/bookings/${booking._id}/payment`}
                          className="mt-4 inline-flex text-sm font-extrabold text-coral"
                        >
                          View payment details
                        </Link>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState
                    title="No booking history"
                    description="Your vendor requests will show here."
                    actionLabel="Browse vendors"
                    actionTo="/vendors"
                  />
                </div>
              )}
            </PremiumCard>

            <section className="grid gap-8 lg:grid-cols-2">
              <PremiumCard className="p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-extrabold">Reviews Preview</h2>
                  <Star className="h-5 w-5 text-amber-400" />
                </div>
                <div className="mt-5 space-y-3">
                  {reviewsGiven.length ? (
                    reviewsGiven.slice(0, 3).map((review) => (
                      <article
                        key={review._id}
                        className="rounded-2xl border border-ink/8 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-extrabold">
                            {review.vendorId?.businessName || "Vendor"}
                          </p>
                          <span className="flex gap-0.5 text-amber-400">
                            {[1, 2, 3, 4, 5].map((item) => (
                              <Star
                                key={item}
                                className={`h-4 w-4 ${item <= review.rating ? "fill-current" : "text-ink/15"}`}
                              />
                            ))}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/55">
                          {review.comment}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-slate-50 p-5 text-sm text-ink/50">
                      Reviews you write will appear here.
                    </p>
                  )}
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <h2 className="text-2xl font-extrabold">Quick Actions</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Book Vendor", "/vendors", CalendarPlus],
                    ["Browse Categories", "/services", Store],
                    [
                      "View Calendar",
                      "/customer/dashboard?view=calendar",
                      CalendarDays,
                    ],
                    [
                      "Open Messages",
                      "/customer/dashboard?view=messages",
                      MessageCircle,
                    ],
                    ["Contact Support", "/contact", Mail],
                  ].map(([label, to, Icon]) => (
                    <Link
                      key={label}
                      to={to}
                      className="flex items-center gap-3 rounded-2xl border border-ink/8 bg-white p-4 font-extrabold text-ink transition hover:-translate-y-0.5 hover:border-coral/30 hover:text-coral hover:shadow-soft"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/10 text-coral">
                        <Icon className="h-5 w-5" />
                      </span>
                      {label}
                    </Link>
                  ))}
                </div>
              </PremiumCard>
            </section>
          </main>

          <aside className="space-y-8 xl:sticky xl:top-28 xl:self-start">
            <PremiumCard className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">Favorites Preview</h2>
                <Button
                  to="/customer/favorites"
                  variant="ghost"
                  className="!px-3 !py-2"
                >
                  View All
                </Button>
              </div>
              <div className="mt-5 space-y-3">
                {favoriteVendors.length ? (
                  favoriteVendors.slice(0, 4).map((vendor) => (
                    <Link
                      key={vendor._id}
                      to={`/vendors/${vendor._id}`}
                      className="flex items-center gap-3 rounded-2xl border border-ink/8 p-3 transition hover:bg-slate-50"
                    >
                      <img
                        src={getVendorImage(vendor)}
                        alt={vendor.businessName}
                        className="h-12 w-12 rounded-2xl object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">
                          {vendor.businessName}
                        </span>
                        <span className="block truncate text-xs text-ink/45">
                          {vendor.serviceCategory ||
                            vendor.category ||
                            "Vendor"}
                        </span>
                      </span>
                      <Heart className="h-4 w-4 fill-coral text-coral" />
                    </Link>
                  ))
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-ink/50">
                    No saved vendors yet.
                  </p>
                )}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Messages Preview</h2>
              <div className="mt-5 space-y-3">
                {messages.length ? (
                  messages.map(({ vendor, message, unread }) => (
                    <div
                      key={vendor._id}
                      className="flex items-center gap-3 rounded-2xl border border-ink/8 p-3"
                    >
                      <img
                        src={getVendorImage(vendor)}
                        alt={vendor.businessName}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold">
                          {vendor.businessName}
                        </p>
                        <p className="truncate text-xs text-ink/45">
                          {message}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-coral text-xs font-extrabold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-ink/50">
                    Vendor conversations will appear here.
                  </p>
                )}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <MiniCalendar bookings={bookings} />
            </PremiumCard>

            <PremiumCard className="p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold">Planzo AI</h2>
                  <p className="text-sm text-ink/45">Smart recommendations</p>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6 text-ink/60">
                <p className="rounded-2xl bg-gradient-to-br from-coral/10 to-white p-4">
                  Based on your {nextBooking?.eventType || "event"} budget near{" "}
                  {nextBooking?.eventLocation ||
                    favoriteVendors[0]?.location ||
                    "your selected location"}
                  , prioritize verified vendors with ratings above 4.5.
                </p>
                <p className="rounded-2xl bg-slate-50 p-4">
                  Your current spend leaves {formatCurrency(remaining)} for
                  add-ons and contingency.
                </p>
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Activity Feed</h2>
              <div className="mt-5 space-y-3">
                {(activity.length
                  ? activity
                  : [
                      "Saved vendors will appear here",
                      "Bookings update in real time",
                    ]
                ).map((item, index) => (
                  <div key={`${item}-${index}`} className="flex gap-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-coral" />
                    <p className="text-sm font-semibold text-ink/60">{item}</p>
                  </div>
                ))}
              </div>
            </PremiumCard>

            <PremiumCard className="overflow-hidden">
              <div className="border-b border-ink/8 p-6">
                <h2 className="text-xl font-extrabold">Account Settings</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  {settingsTabs.map(([label, Icon]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSettingsTab(label)}
                      className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-xs font-extrabold transition ${
                        settingsTab === label
                          ? "bg-ink text-white"
                          : "bg-slate-50 text-ink/55 hover:bg-ink/5 hover:text-ink"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {label.split(" ")[0]}
                    </button>
                  ))}
                </div>

                {settingsTab === "Personal Information" && (
                  <form
                    onSubmit={saveProfile}
                    className="mt-4 space-y-4 rounded-2xl bg-slate-50 p-4"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-coral">
                      Personal Information
                    </p>
                    <label className="block">
                      <span className="label">Full name</span>
                      <input
                        required
                        value={profileForm.name}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        className="field"
                      />
                    </label>
                    <label className="block">
                      <span className="label">Email address</span>
                      <input
                        required
                        type="email"
                        value={profileForm.email}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        className="field"
                      />
                    </label>
                    <label className="block">
                      <span className="label">Phone number</span>
                      <input
                        required
                        type="tel"
                        value={profileForm.phone}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        className="field"
                      />
                    </label>
                    <Button
                      type="submit"
                      loading={settingsSaving === "profile"}
                      disabled={Boolean(settingsSaving)}
                      className="w-full"
                    >
                      Save profile
                    </Button>
                  </form>
                )}

                {settingsTab === "Security" && (
                  <form
                    onSubmit={savePassword}
                    className="mt-4 space-y-4 rounded-2xl bg-slate-50 p-4"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-coral">
                      Security
                    </p>
                    <label className="block">
                      <span className="label">Current password</span>
                      <input
                        required
                        name="currentPassword"
                        type="password"
                        className="field"
                      />
                    </label>
                    <label className="block">
                      <span className="label">New password</span>
                      <input
                        required
                        name="newPassword"
                        type="password"
                        minLength="8"
                        className="field"
                        placeholder="Uppercase, number, and symbol"
                      />
                    </label>
                    <Button
                      type="submit"
                      loading={settingsSaving === "password"}
                      disabled={Boolean(settingsSaving)}
                      className="w-full"
                    >
                      Change password
                    </Button>
                  </form>
                )}

                {settingsTab === "Notifications" && (
                  <form
                    onSubmit={saveNotifications}
                    className="mt-4 space-y-4 rounded-2xl bg-slate-50 p-4"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-coral">
                      Notifications
                    </p>
                    {[
                      ["bookingUpdates", "Booking updates"],
                      ["reviewReminders", "Review reminders"],
                      ["promotions", "Offers and recommendations"],
                    ].map(([field, label]) => (
                      <label
                        key={field}
                        className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={notificationForm[field]}
                          onChange={(event) =>
                            setNotificationForm((current) => ({
                              ...current,
                              [field]: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 accent-coral"
                        />
                      </label>
                    ))}
                    <Button
                      type="submit"
                      loading={settingsSaving === "notifications"}
                      disabled={Boolean(settingsSaving)}
                      className="w-full"
                    >
                      Save preferences
                    </Button>
                  </form>
                )}

                {settingsTab === "Privacy" && (
                  <form
                    onSubmit={removeAccount}
                    className="mt-4 space-y-4 rounded-2xl bg-red-50 p-4"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-red-600">
                      Privacy
                    </p>
                    <p className="text-sm leading-6 text-ink/60">
                      Deleting your account removes your saved vendors, reviews,
                      and closed booking history. Active bookings must be
                      resolved first.
                    </p>
                    <label className="block">
                      <span className="label">Confirm password</span>
                      <input
                        required
                        name="password"
                        type="password"
                        className="field"
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="outline"
                      loading={settingsSaving === "delete"}
                      disabled={Boolean(settingsSaving)}
                      className="w-full !border-red-200 !text-red-600 hover:!border-red-300"
                    >
                      <Trash2 className="h-4 w-4" /> Delete account
                    </Button>
                  </form>
                )}
              </div>
            </PremiumCard>
          </aside>
        </div>

        <motion.footer
          variants={fadeUp}
          className="grid gap-4 rounded-2xl border border-ink/8 bg-ink p-6 text-white shadow-lift lg:grid-cols-3"
        >
          <div>
            <h2 className="text-xl font-extrabold">Helpful tips</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Confirm venue availability before final vendor payments and keep a
              10% contingency buffer.
            </p>
          </div>
          <div className="rounded-2xl bg-white/8 p-4">
            <p className="text-sm font-extrabold">Upcoming reminder</p>
            <p className="mt-1 text-sm text-white/60">
              {nextBooking
                ? `${nextBooking.eventType} with ${nextBooking.vendorId?.businessName || "your vendor"} on ${formatDate(nextBooking.eventDate)}`
                : "Create your first booking to unlock reminders."}
            </p>
          </div>
          <div className="rounded-2xl bg-white/8 p-4">
            <p className="text-sm font-extrabold">Budget cue</p>
            <p className="mt-1 text-sm text-white/60">
              You have {formatCurrency(remaining)} remaining across active
              plans.
            </p>
          </div>
        </motion.footer>
      </motion.div>

      {reviewBooking && (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-xl rounded-2xl bg-white p-6 shadow-lift sm:p-8">
            <ReviewForm
              initialReview={reviewsByBooking[reviewBooking._id]}
              vendorName={reviewBooking.vendorId?.businessName || "this vendor"}
              submitting={savingReview}
              onSubmit={saveReview}
              onCancel={() => setReviewBooking(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
