import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  Bot,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Edit3,
  Eye,
  ImagePlus,
  Inbox,
  Layers3,
  MapPin,
  MessageSquare,
  PackageCheck,
  RefreshCcw,
  Reply,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Upload,
  UsersRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  cancelBookingRequest,
  getVendorRequests,
  updateBookingStatus,
} from "../services/bookingService";
import { getVendorDashboard } from "../services/dashboardService";
import { getVendorReviews, replyToReview } from "../services/reviewService";
import { getMyVendorProfile } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

const statusMeta = {
  pending: {
    title: "Pending",
    className: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    color: "bg-amber-400",
  },
  accepted: {
    title: "Confirmed",
    className: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    color: "bg-blue-500",
  },
  completed: {
    title: "Completed",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    color: "bg-emerald-500",
  },
  rejected: {
    title: "Cancelled",
    className: "bg-red-50 text-red-600 ring-1 ring-red-100",
    color: "bg-red-500",
  },
  cancelled: {
    title: "Cancelled",
    className: "bg-red-50 text-red-600 ring-1 ring-red-100",
    color: "bg-red-500",
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const initials = (name = "PZ") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const sameDay = (value, date = new Date()) => {
  const item = new Date(value);
  return (
    item.getFullYear() === date.getFullYear() &&
    item.getMonth() === date.getMonth() &&
    item.getDate() === date.getDate()
  );
};

const bookingTime = (booking) =>
  booking.eventStartTime && booking.eventEndTime
    ? `${booking.eventStartTime} - ${booking.eventEndTime}`
    : "Time pending";

const imageUrl = (image) => (typeof image === "string" ? image : image?.url);

const Stars = ({ value = 0 }) => (
  <span className="flex gap-0.5 text-amber-400">
    {[1, 2, 3, 4, 5].map((item) => (
      <Star
        key={item}
        className={`h-4 w-4 ${
          item <= Math.round(value) ? "fill-current" : "text-ink/15"
        }`}
      />
    ))}
  </span>
);

function PremiumCard({ children, className = "", delay = 0 }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.42, delay }}
      whileHover={{ y: -4 }}
      className={`rounded-2xl border border-ink/8 bg-white shadow-[0_18px_60px_rgba(36,23,42,0.08)] transition-shadow hover:shadow-lift ${className}`}
    >
      {children}
    </motion.section>
  );
}

function Sparkline({ color = "#ef6f61" }) {
  return (
    <svg viewBox="0 0 108 34" className="h-9 w-28" aria-hidden="true">
      <path
        d="M3 27 C 16 10, 24 24, 36 15 S 56 6, 68 16 S 88 29, 105 8"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AreaChart({ monthlyData }) {
  const values = monthlyData.map((item) => item.revenue);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 100;
    const y = 80 - (value / max) * 60;
    return `${x},${y}`;
  });
  const area = `0,90 ${points.join(" ")} 100,90`;

  return (
    <div>
      <svg viewBox="0 0 100 96" className="h-64 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="vendorRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef6f61" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#ef6f61" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(36,23,42,0.08)" strokeWidth="0.5" />
        ))}
        <polygon points={area} fill="url(#vendorRevenueGradient)" />
        <polyline points={points.join(" ")} fill="none" stroke="#ef6f61" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => {
          const [x, y] = point.split(",");
          return <circle key={point} cx={x} cy={y} r="1.6" fill="#ef6f61" />;
        })}
      </svg>
      <div className="grid grid-cols-6 gap-2 text-center text-xs font-bold text-ink/35">
        {monthlyData.map((item) => (
          <span key={item.label}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}

function RadialProgress({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-4">
      <div
        className="mx-auto grid h-24 w-24 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#24172a ${value}%, #eef2f7 0)`,
        }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-center shadow-inner">
          <Icon className="h-5 w-5 text-coral" />
          <span className="text-xs font-extrabold">{value}%</span>
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-extrabold text-ink/65">{label}</p>
    </div>
  );
}

function AvailabilityCalendar({ requests, selectedDate, onSelectDate }) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const booked = new Set(
    requests
      .filter((item) => ["accepted", "completed"].includes(item.status))
      .map((item) => new Date(item.eventDate).getDate()),
  );
  const pending = new Set(
    requests
      .filter((item) => item.status === "pending")
      .map((item) => new Date(item.eventDate).getDate()),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold">
            {today.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </h3>
          <p className="text-xs font-semibold text-ink/40">Booked, pending, and open slots</p>
        </div>
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
          const date = new Date(today.getFullYear(), today.getMonth(), day);
          const selected = sameDay(selectedDate, date);
          const bookedDay = booked.has(day);
          const pendingDay = pending.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`grid aspect-square place-items-center rounded-xl text-xs font-bold transition ${
                selected
                  ? "bg-ink text-white"
                  : bookedDay
                    ? "bg-coral text-white"
                    : pendingDay
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-50 text-ink/55 hover:bg-ink/5"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-ink/45">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-coral" /> Booked</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" /> Free</span>
      </div>
    </div>
  );
}

export default function VendorDashboardPage() {
  useDocumentTitle("Vendor Dashboard - Planzo");
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [replyingId, setReplyingId] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    Promise.allSettled([
      getVendorRequests(),
      getMyVendorProfile(),
      getVendorDashboard({ limit: 8 }),
    ])
      .then(async ([bookingResult, profileResult, dashboardResult]) => {
        if (bookingResult.status === "fulfilled") {
          setRequests(bookingResult.value);
        } else if (bookingResult.reason.response?.status !== 404) {
          setError(
            getApiError(bookingResult.reason, "Unable to load booking requests."),
          );
        }

        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
          try {
            const data = await getVendorReviews(profileResult.value._id, {
              limit: 50,
            });
            setReviews(data.reviews);
          } catch (requestError) {
            setError(
              getApiError(requestError, "Unable to load customer reviews."),
            );
          }
        }

        if (dashboardResult.status === "fulfilled") {
          setDashboard(dashboardResult.value);
          if (profileResult.status !== "fulfilled" && dashboardResult.value.profile) {
            setProfile(dashboardResult.value.profile);
          }
        } else if (!error) {
          setError(
            getApiError(
              dashboardResult.reason,
              "Unable to load dashboard analytics.",
            ),
          );
        }
      })
      .finally(() => {
        setLoading(false);
        setReviewsLoading(false);
      });
  }, []);

  const profileStrength = useMemo(() => {
    const checks = [
      profile?.businessName,
      profile?.serviceCategory,
      profile?.location,
      profile?.description,
      profile?.pricing,
      profile?.portfolioImages?.length,
      profile?.verificationStatus === "approved" || profile?.verified,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile]);

  const stats = useMemo(() => {
    const pending =
      dashboard?.summary?.pendingRequests ??
      requests.filter((item) => item.status === "pending").length;
    const accepted =
      dashboard?.summary?.acceptedBookings ??
      requests.filter((item) => item.status === "accepted").length;
    const completed = requests.filter((item) => item.status === "completed").length;
    const cancelled = requests.filter((item) => ["rejected", "cancelled"].includes(item.status)).length;
    const completedRevenue = requests
      .filter((item) => item.status === "completed")
      .reduce((total, item) => total + (Number(item.budget) || 0), 0);
    const bookedRevenue = requests
      .filter((item) => ["accepted", "completed"].includes(item.status))
      .reduce((total, item) => total + (Number(item.budget) || 0), 0);
    const todayBookings = requests.filter((item) => sameDay(item.eventDate));
    const monthBookings = requests.filter((item) => {
      const date = new Date(item.eventDate);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    const completionBase = completed + cancelled;
    const averageRating = profile?.averageRating || profile?.rating || 0;

    return {
      totalBookings: dashboard?.summary?.totalBookings ?? requests.length,
      pending,
      accepted,
      completed,
      cancelled,
      completedRevenue,
      bookedRevenue,
      todayBookings,
      monthBookings,
      monthlyRevenue: dashboard?.summary?.monthlyRevenue ?? monthBookings
        .filter((item) => ["accepted", "completed"].includes(item.status))
        .reduce((total, item) => total + (Number(item.budget) || 0), 0),
      completionRate: completionBase ? Math.round((completed / completionBase) * 100) : 0,
      averageRating: dashboard?.summary?.averageRating ?? averageRating,
      reviewCount:
        dashboard?.summary?.reviewCount ??
        profile?.reviewCount ??
        profile?.reviewsCount ??
        reviews.length,
      totalEarnings: dashboard?.summary?.totalEarnings ?? completedRevenue,
      profileCompletion:
        dashboard?.summary?.profileCompletionPercentage ?? profileStrength,
      verificationStatus:
        dashboard?.summary?.verificationStatus ??
        profile?.verificationStatus ??
        (profile?.verified ? "approved" : "pending"),
    };
  }, [requests, profile, reviews.length, dashboard, profileStrength]);

  const monthlyData = useMemo(() => {
    if (dashboard?.monthlyStats?.length) return dashboard.monthlyStats;
    return [];
  }, [dashboard]);

  const upcomingEvents = useMemo(
    () =>
      (dashboard?.upcomingEvents?.length ? dashboard.upcomingEvents : requests)
        .filter((item) => ["accepted", "pending"].includes(item.status) && new Date(item.eventDate) >= new Date())
        .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate)),
    [requests, dashboard],
  );

  const pendingRequests = requests.filter((item) => item.status === "pending");
  const selectedDateBookings = requests.filter((item) => sameDay(item.eventDate, selectedDate));

  const ratingDistribution = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: reviews.filter((review) => Math.round(review.rating) === rating).length,
      })),
    [reviews],
  );

  const packageCards = useMemo(() => {
    if (Array.isArray(profile?.packages) && profile.packages.length) {
      return profile.packages.slice(0, 3);
    }
    const base = Number(profile?.pricing) || 25000;
    return [
      { name: "Basic", price: base, description: "Lean coverage for compact events." },
      { name: "Premium", price: base * 2, description: "Popular package with planning support." },
      { name: "Luxury", price: base * 3, description: "Full-service experience for signature events." },
    ];
  }, [profile]);

  const changeStatus = async (id, status) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await updateBookingStatus(id, status);
      setRequests((current) =>
        current.map((request) => (request._id === id ? updated : request)),
      );
      setSuccess("Booking status updated.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to update this request."));
    } finally {
      setUpdatingId("");
    }
  };

  const cancelRequest = async (id) => {
    const reason = window.prompt("Why are you cancelling this booking?");
    if (!reason?.trim()) return;
    setUpdatingId(id); setError("");
    try { const { booking } = await cancelBookingRequest(id, reason.trim()); setRequests((current) => current.map((item) => item._id === id ? booking : item)); setSuccess("Booking cancelled and refund request created."); }
    catch (requestError) { setError(getApiError(requestError, "Unable to cancel this booking.")); }
    finally { setUpdatingId(""); }
  };

  const saveReply = async (reviewId) => {
    const message = replyDrafts[reviewId]?.trim();
    if (!message) return;

    setReplyingId(reviewId);
    setError("");
    try {
      const updated = await replyToReview(reviewId, message);
      setReviews((current) =>
        current.map((review) => (review._id === reviewId ? updated : review)),
      );
      setReplyDrafts((current) => ({ ...current, [reviewId]: "" }));
      setSuccess("Review reply saved.");
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to save your reply."));
    } finally {
      setReplyingId("");
    }
  };

  const analyticsCards = [
    [Banknote, "Total Earnings", stats.totalEarnings, "", "#16a34a"],
    [WalletCards, "Monthly Revenue", stats.monthlyRevenue, "", "#ef6f61"],
    [CalendarCheck, "Total Bookings", stats.totalBookings, "", "#2563eb"],
    [CheckCircle2, "Profile Complete", `${stats.profileCompletion}%`, "", "#16a34a"],
    [Star, "Average Rating", stats.averageRating || "New", "", "#f59e0b"],
    [MessageSquare, "Recent Messages", dashboard?.recentMessages?.length || 0, "", "#57214f"],
  ];

  const statusCards = [
    ["pending", stats.pending, "Awaiting your response"],
    ["accepted", stats.accepted, "Confirmed event work"],
    ["completed", stats.completed, "Delivered successfully"],
    ["cancelled", stats.cancelled, "Rejected or cancelled"],
  ];

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
        {!profile && (
          <motion.div variants={fadeUp} className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
            Complete your vendor profile before customers can confidently book you.
          </motion.div>
        )}

        <motion.section variants={fadeUp} className="relative overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-[#f7fbff] via-white to-[#fff5f1] p-6 shadow-lift sm:p-8 lg:p-10">
          <div className="absolute right-8 top-8 h-56 w-56 rounded-full bg-coral/10 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <img
                  src={profile ? getVendorImage(profile) : undefined}
                  alt={profile?.businessName || user?.name}
                  className="h-20 w-20 rounded-2xl bg-slate-100 object-cover shadow-soft"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-extrabold uppercase text-coral backdrop-blur">
                      Business Summary
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${
                      profile?.verified || profile?.verificationStatus === "approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {profile?.verified || profile?.verificationStatus === "approved" ? "Verified" : "Verification pending"}
                    </span>
                  </div>
                  <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">
                    Welcome back, {profile?.businessName || user?.name || "Vendor"}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55 sm:text-base">
                    Monitor revenue, requests, schedule, reviews, portfolio, and business health from one modern command center.
                  </p>
                </div>
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button to="/vendor/availability">
                  <CalendarDays className="h-4 w-4" /> Update Availability
                </Button>
                <Button to="/vendor/profile-setup#portfolio" variant="dark">
                  <Upload className="h-4 w-4" /> Upload Portfolio
                </Button>
                <Button to={profile ? `/vendors/${profile._id}` : "/vendor/profile-setup"} variant="outline">
                  <Eye className="h-4 w-4" /> Public Profile
                </Button>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur-xl sm:grid-cols-2">
              {[
                ["Bookings This Month", stats.monthBookings.length, CalendarCheck],
                ["Revenue", formatCurrency(stats.bookedRevenue), Banknote],
                ["Average Rating", stats.averageRating || "New", Star],
                ["Pending Requests", stats.pending, Inbox],
                ["Upcoming Events", upcomingEvents.length, CalendarDays],
                ["Today's Bookings", stats.todayBookings.length, Clock3],
              ].map(([label, value, Icon]) => (
                <motion.div key={label} whileHover={{ scale: 1.03 }} className="rounded-2xl border border-ink/8 bg-white p-4">
                  <Icon className="h-5 w-5 text-coral" />
                  <p className="mt-4 truncate text-2xl font-extrabold">{value}</p>
                  <p className="mt-1 text-xs font-bold text-ink/45">{label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {analyticsCards.map(([Icon, title, value, growth, color], index) => (
            <PremiumCard key={title} delay={index * 0.035} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink/[0.04] text-coral">
                  <Icon className="h-5 w-5" />
                </span>
                {growth ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                    <TrendingUp className="h-3 w-3" /> {growth}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 truncate text-2xl font-extrabold">{typeof value === "number" && title.includes("Revenue") ? formatCurrency(value) : value}</p>
              <p className="mt-1 text-sm font-bold text-ink/45">{title}</p>
              <div className="mt-3">
                <Sparkline color={color} />
              </div>
            </PremiumCard>
          ))}
        </section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <main className="space-y-8">
            <PremiumCard className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold">Revenue Analytics</h2>
                  <p className="mt-1 text-sm text-ink/45">Monthly revenue and booking trend from accepted and completed events.</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs font-bold uppercase text-ink/35">Monthly revenue</p>
                  <p className="text-xl font-extrabold">{formatCurrency(stats.monthlyRevenue)}</p>
                </div>
              </div>
              <div className="mt-6">
                <AreaChart monthlyData={monthlyData} />
              </div>
            </PremiumCard>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statusCards.map(([status, value, note]) => {
                const meta = statusMeta[status];
                const percent = Math.round((value / Math.max(requests.length, 1)) * 100);
                return (
                  <PremiumCard key={status} className="p-5">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${meta.className}`}>{meta.title}</span>
                      <span className="text-2xl font-extrabold">{value}</span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-ink/45">{note}</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <motion.span initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.7 }} className={`block h-full rounded-full ${meta.color}`} />
                    </div>
                  </PremiumCard>
                );
              })}
            </section>

            <PremiumCard className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/8 p-6">
                <div>
                  <h2 className="text-2xl font-extrabold">Recent Booking Requests</h2>
                  <p className="mt-1 text-sm text-ink/45">Accept, reject, or open a customer chat from the request queue.</p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700">{stats.pending} pending</span>
              </div>
              {pendingRequests.length ? (
                <div className="grid gap-4 p-5 lg:grid-cols-2">
                  {pendingRequests.slice(0, 6).map((request) => (
                    <article key={request._id} className="rounded-2xl border border-ink/8 bg-white p-5 shadow-[0_12px_34px_rgba(36,23,42,0.05)]">
                      <div className="flex items-start gap-4">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral to-plum text-sm font-extrabold text-white">
                          {initials(request.customerId?.name || "Customer")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-extrabold">{request.customerId?.name || "Customer"}</p>
                              <p className="mt-1 text-sm text-ink/45">{request.eventType}</p>
                            </div>
                            <p className="font-extrabold text-coral">{formatCurrency(request.budget || 0)}</p>
                          </div>
                          <div className="mt-4 grid gap-2 text-sm text-ink/55">
                            <span className="flex items-center gap-2"><CalendarCheck className="h-4 w-4" /> {formatDate(request.eventDate)} · {bookingTime(request)}</span>
                            <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {request.eventLocation || "Location pending"}</span>
                          </div>
                          {request.specialRequirements && (
                            <p className="mt-4 line-clamp-2 rounded-2xl bg-slate-50 p-3 text-sm text-ink/55">{request.specialRequirements}</p>
                          )}
                          <div className="mt-5 flex flex-wrap gap-2">
                            <Button type="button" disabled={updatingId === request._id} onClick={() => changeStatus(request._id, "accepted")} className="!px-4 !py-2">
                              <Check className="h-4 w-4" /> Accept
                            </Button>
                            <Button type="button" variant="outline" disabled={updatingId === request._id} onClick={() => changeStatus(request._id, "rejected")} className="!px-4 !py-2">
                              <XCircle className="h-4 w-4" /> Reject
                            </Button>
                            <Button type="button" variant="ghost" disabled={updatingId === request._id} onClick={() => cancelRequest(request._id)} className="!px-4 !py-2 text-red-600">Cancel</Button>
                            <Button to="/vendor/dashboard?view=messages" variant="ghost" className="!px-4 !py-2">
                              <MessageSquare className="h-4 w-4" /> Chat
                            </Button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState title="No pending requests" description="New customer requests will appear here." />
                </div>
              )}
            </PremiumCard>

            <section className="grid gap-8 lg:grid-cols-2">
              <PremiumCard className="p-6">
                <h2 className="text-2xl font-extrabold">Upcoming Events</h2>
                <div className="mt-5 space-y-4">
                  {upcomingEvents.length ? (
                    upcomingEvents.slice(0, 5).map((event) => (
                      <article key={event._id} className="flex gap-4 rounded-2xl border border-ink/8 p-4">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white">
                          <CalendarCheck className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-extrabold">{event.customerId?.name || "Client"}</p>
                              <p className="text-sm text-ink/45">{event.eventType}</p>
                            </div>
                            <Button to="/vendor/dashboard?view=messages" variant="ghost" className="!px-3 !py-2">
                              Contact
                            </Button>
                            <button type="button" onClick={() => cancelRequest(event._id)} className="text-xs font-bold text-red-600">Cancel</button>
                          </div>
                          <p className="mt-3 text-sm text-ink/55">{formatDate(event.eventDate)} · {bookingTime(event)}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/45"><MapPin className="h-4 w-4" /> {event.eventLocation || "Location pending"}</p>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-slate-50 p-5 text-sm text-ink/50">No upcoming events yet.</p>
                  )}
                </div>
              </PremiumCard>

              <PremiumCard className="p-6">
                <h2 className="text-2xl font-extrabold">Today's Schedule</h2>
                <div className="mt-5 space-y-4">
                  {(stats.todayBookings.length ? stats.todayBookings : upcomingEvents.slice(0, 3)).map((task) => (
                    <article key={task._id} className="flex gap-4 rounded-2xl bg-slate-50 p-4">
                      <span className="mt-1 h-3 w-3 rounded-full bg-coral" />
                      <div>
                        <p className="font-extrabold">{task.eventType}</p>
                        <p className="mt-1 text-sm text-ink/50">{bookingTime(task)} with {task.customerId?.name || "client"}</p>
                      </div>
                    </article>
                  ))}
                  {!stats.todayBookings.length && !upcomingEvents.length && (
                    <p className="rounded-2xl bg-slate-50 p-5 text-sm text-ink/50">Your schedule is clear today.</p>
                  )}
                </div>
              </PremiumCard>
            </section>

            <PremiumCard className="overflow-hidden">
              <div className="border-b border-ink/8 p-6">
                <h2 className="text-2xl font-extrabold">Reviews Overview</h2>
                <p className="mt-1 text-sm text-ink/45">Average rating, distribution, latest reviews, and public replies.</p>
              </div>
              <div className="grid gap-6 p-6 lg:grid-cols-[260px_1fr]">
                <div className="rounded-2xl bg-slate-50 p-5 text-center">
                  <p className="text-5xl font-extrabold">{stats.averageRating || "New"}</p>
                  <div className="mt-3 flex justify-center"><Stars value={stats.averageRating} /></div>
                  <p className="mt-2 text-sm font-bold text-ink/45">{stats.reviewCount} reviews</p>
                  <div className="mt-5 space-y-2">
                    {ratingDistribution.map(({ rating, count }) => (
                      <div key={rating} className="flex items-center gap-2 text-xs font-bold text-ink/45">
                        <span>{rating}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                          <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.round((count / Math.max(reviews.length, 1)) * 100)}%` }} />
                        </div>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {reviewsLoading ? (
                  <div className="p-8 text-center text-sm text-ink/45">Loading reviews...</div>
                ) : reviews.length ? (
                  <div className="grid gap-4">
                    {reviews.slice(0, 4).map((review) => (
                      <article key={review._id} className="rounded-2xl border border-ink/8 p-5">
                        <div className="flex items-start gap-4">
                          <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-sm font-extrabold">{initials(review.customerId?.name)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-extrabold">{review.customerId?.name || "Customer"}</p>
                                <p className="text-xs text-ink/40">{formatDate(review.createdAt)}</p>
                              </div>
                              <Stars value={review.rating} />
                            </div>
                            <p className="mt-3 text-sm leading-6 text-ink/60">{review.comment}</p>
                            {review.vendorReply?.message ? (
                              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-ink/60">
                                <p className="text-xs font-extrabold uppercase tracking-wider text-coral">Your reply</p>
                                <p className="mt-2">{review.vendorReply.message}</p>
                              </div>
                            ) : (
                              <div className="mt-4">
                                <textarea
                                  value={replyDrafts[review._id] || ""}
                                  onChange={(event) =>
                                    setReplyDrafts((current) => ({ ...current, [review._id]: event.target.value }))
                                  }
                                  className="field min-h-24 resize-none"
                                  placeholder="Write a thoughtful reply..."
                                />
                                <Button
                                  type="button"
                                  loading={replyingId === review._id}
                                  disabled={replyingId === review._id || !replyDrafts[review._id]?.trim()}
                                  onClick={() => saveReply(review._id)}
                                  className="mt-3"
                                >
                                  <Reply className="h-4 w-4" /> Reply
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No reviews yet" description="Customer reviews will appear after completed bookings." />
                )}
              </div>
            </PremiumCard>
          </main>

          <aside className="space-y-8 xl:sticky xl:top-28 xl:self-start">
            <PremiumCard className="p-6">
              <AvailabilityCalendar requests={requests} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-extrabold">{formatDate(selectedDate)}</p>
                <p className="mt-1 text-sm text-ink/50">
                  {selectedDateBookings.length ? `${selectedDateBookings.length} booking item${selectedDateBookings.length > 1 ? "s" : ""}` : "Free slot available"}
                </p>
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Messages Preview</h2>
              <div className="mt-5 space-y-3">
                {(requests.length ? requests.slice(0, 4) : []).map((request, index) => (
                  <Link key={request._id} to="/vendor/dashboard?view=messages" className="flex items-center gap-3 rounded-2xl border border-ink/8 p-3 transition hover:bg-slate-50">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-coral to-plum text-sm font-extrabold text-white">
                      {initials(request.customerId?.name || "Client")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{request.customerId?.name || "Client"}</span>
                      <span className="block truncate text-xs text-ink/45">{request.eventType} request is {request.status}</span>
                    </span>
                    {index < 2 && <span className="grid h-6 w-6 place-items-center rounded-full bg-coral text-xs font-extrabold text-white">{index + 1}</span>}
                  </Link>
                ))}
                {!requests.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-ink/50">Customer chats will appear here.</p>}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">Portfolio Preview</h2>
                <Button to="/vendor/profile-setup#portfolio" variant="ghost" className="!px-3 !py-2">
                  <ImagePlus className="h-4 w-4" /> Upload
                </Button>
              </div>
              {profile?.portfolioImages?.length ? (
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {profile.portfolioImages.slice(0, 6).map((image, index) => (
                    <img key={imageUrl(image) || index} src={imageUrl(image)} alt="Portfolio" className="aspect-square rounded-2xl object-cover" />
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-ink/50">Upload portfolio images to strengthen your profile.</p>
              )}
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Packages</h2>
              <div className="mt-5 space-y-3">
                {packageCards.map((pkg, index) => (
                  <div key={pkg.name || index} className="rounded-2xl border border-ink/8 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-extrabold">{pkg.name || pkg.title || ["Basic", "Premium", "Luxury"][index]}</p>
                      <Button to="/vendor/profile-setup#packages" variant="ghost" className="!px-3 !py-1.5">
                        Edit
                      </Button>
                    </div>
                    <p className="mt-2 text-lg font-extrabold text-coral">{formatCurrency(pkg.price || pkg.pricing || pkg.amount || 0)}</p>
                    <p className="mt-1 text-sm text-ink/45">{pkg.description || "Package details can be managed from profile setup."}</p>
                  </div>
                ))}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Payment Overview</h2>
              <div className="mt-5 grid gap-3">
                {[
                  ["Total Earnings", stats.totalEarnings],
                  ["Pending Payments", Math.max(stats.bookedRevenue - stats.totalEarnings, 0)],
                  ["Completed Payments", stats.totalEarnings],
                  ["Refunds", 0],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="text-sm font-bold text-ink/45">{label}</span>
                    <span className="font-extrabold">{formatCurrency(value)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                Withdrawal Status: Ready for next payout
              </div>
              <Button to="/vendor/dashboard?view=payments" variant="outline" className="mt-4 w-full">
                <CreditCard className="h-4 w-4" /> Invoice History
              </Button>
            </PremiumCard>

            <PremiumCard className="p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold">Business Insights</h2>
                  <p className="text-sm text-ink/45">AI suggestions</p>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm text-ink/60">
                {[
                  "Increase profile photos to improve conversion.",
                  "Improve response time on pending requests.",
                  "Review pricing for peak event dates.",
                  "Add more portfolio images from recent work.",
                ].map((item) => (
                  <p key={item} className="rounded-2xl bg-slate-50 p-4">{item}</p>
                ))}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Customer Statistics</h2>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                {[
                  ["Returning", Math.max(0, Math.round(requests.length * 0.28))],
                  ["New", Math.max(0, requests.length)],
                  ["Conversion", `${requests.length ? Math.round((stats.accepted / requests.length) * 100) : 0}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xl font-extrabold">{value}</p>
                    <p className="mt-1 text-xs font-bold text-ink/40">{label}</p>
                  </div>
                ))}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Performance Score</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <RadialProgress label="Profile" value={profileStrength} icon={PackageCheck} />
                <RadialProgress label="Response" value={stats.pending ? 72 : 96} icon={MessageSquare} />
                <RadialProgress label="Acceptance" value={requests.length ? Math.round((stats.accepted / requests.length) * 100) : 0} icon={CheckCircle2} />
                <RadialProgress label="Reviews" value={stats.averageRating ? Math.round((stats.averageRating / 5) * 100) : 0} icon={Star} />
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-ink/55">
                Verification Status: {stats.verificationStatus}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Quick Actions</h2>
              <div className="mt-5 grid gap-3">
                {[
                  [Check, "Accept Booking", "/vendor/dashboard?view=bookings"],
                  [CalendarDays, "Update Availability", "/vendor/availability"],
                  [Upload, "Upload Portfolio", "/vendor/profile-setup#portfolio"],
                  [Layers3, "Create Package", "/vendor/profile-setup#packages"],
                  [MessageSquare, "Open Messages", "/vendor/dashboard?view=messages"],
                ].map(([Icon, label, to]) => (
                  <Link key={label} to={to} className="flex items-center gap-3 rounded-2xl border border-ink/8 p-4 font-extrabold transition hover:-translate-y-0.5 hover:border-coral/30 hover:text-coral hover:shadow-soft">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-coral/10 text-coral"><Icon className="h-5 w-5" /></span>
                    {label}
                  </Link>
                ))}
              </div>
            </PremiumCard>

            <PremiumCard className="p-6">
              <h2 className="text-xl font-extrabold">Notifications</h2>
              <div className="mt-5 space-y-3">
                {[
                  [`${upcomingEvents.length} upcoming events`, CalendarCheck],
                  [`${reviews.filter((review) => !review.vendorReply?.message).length} review reminders`, Star],
                  [`${Math.max(stats.bookedRevenue - stats.completedRevenue, 0) ? "Pending payment alert" : "No payment alerts"}`, WalletCards],
                  [`${stats.pending} booking reminders`, Bell],
                ].map(([label, Icon]) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-ink/60">
                    <Icon className="h-4 w-4 text-coral" /> {label}
                  </div>
                ))}
              </div>
            </PremiumCard>
          </aside>
        </div>
      </motion.div>
    </div>
  );
}
