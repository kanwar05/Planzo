import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Heart,
  IndianRupee,
  LockKeyhole,
  Mail,
  MapPin,
  Shield,
  Star,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ReviewForm from "../components/ReviewForm";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  getMyBookings,
  updateBookingStatus,
} from "../services/bookingService";
import { getFavorites } from "../services/favoriteService";
import {
  createReview,
  deleteReview,
  getBookingReview,
  updateReview,
} from "../services/reviewService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

const statusClass = {
  accepted: "bg-sage/15 text-sage",
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-ink/6 text-ink/55",
  rejected: "bg-red-50 text-red-600",
  cancelled: "bg-ink/5 text-ink/40",
};

const settingsTabs = [
  ["Personal Information", UserRound],
  ["Security", LockKeyhole],
  ["Notifications", Bell],
  ["Privacy", Shield],
];

const initials = (name = "PZ") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function CustomerDashboardPage() {
  useDocumentTitle("Customer profile");
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [reviewsByBooking, setReviewsByBooking] = useState({});
  const [reviewBooking, setReviewBooking] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [settingsTab, setSettingsTab] = useState("Personal Information");

  useEffect(() => {
    Promise.allSettled([getMyBookings(), getFavorites()])
      .then(async ([bookingsResult, favoritesResult]) => {
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
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const upcoming = bookings.filter(
      (booking) =>
        ["pending", "accepted"].includes(booking.status) &&
        new Date(booking.eventDate) >= new Date(),
    );

    return {
      total: bookings.length,
      completed: bookings.filter((booking) => booking.status === "completed")
        .length,
      pending: bookings.filter((booking) => booking.status === "pending")
        .length,
      cancelled: bookings.filter((booking) => booking.status === "cancelled")
        .length,
      upcoming,
    };
  }, [bookings]);

  const reviewsGiven = useMemo(
    () => Object.values(reviewsByBooking).filter(Boolean),
    [reviewsByBooking],
  );

  const cancelBooking = async (id) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await updateBookingStatus(id, "cancelled");
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
      setError(getApiError(requestError, "Unable to delete your review."));
    } finally {
      setUpdatingId("");
    }
  };

  const statCards = [
    [CalendarCheck, "Total bookings", stats.total],
    [CheckCircle2, "Completed", stats.completed],
    [CalendarClock, "Pending", stats.pending],
    [XCircle, "Cancelled", stats.cancelled],
  ];

  return (
    <div className="space-y-8">
      <Toast
        message={error || success}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setSuccess("");
        }}
      />

      <section className="rounded-[2rem] border bg-white p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-coral text-2xl font-extrabold text-white shadow-soft">
              {initials(user?.name)}
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                Customer profile
              </p>
              <h1 className="mt-1 text-3xl font-extrabold">{user?.name}</h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink/50">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4" /> {user?.email}
                </span>
                <span>
                  Member since{" "}
                  {user?.createdAt ? formatDate(user.createdAt) : "recently"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline">
              <Edit3 className="h-4 w-4" /> Edit Profile
            </Button>
            <Button variant="outline">
              <LockKeyhole className="h-4 w-4" /> Change Password
            </Button>
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map(([Icon, title, value]) => (
              <Card key={title} className="p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="text-3xl font-extrabold">{value}</p>
                </div>
                <p className="mt-5 text-sm font-bold text-ink/50">{title}</p>
              </Card>
            ))}
          </section>

          <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b p-6">
                <div>
                  <h2 className="text-xl font-extrabold">Upcoming bookings</h2>
                  <p className="mt-1 text-sm text-ink/45">
                    Active and upcoming event requests.
                  </p>
                </div>
                <Button to="/vendors" variant="ghost" className="hidden sm:flex">
                  Find vendors
                </Button>
              </div>

              {stats.upcoming.length ? (
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  {stats.upcoming.slice(0, 4).map((booking) => (
                    <article
                      key={booking._id}
                      className="rounded-3xl border border-ink/8 p-4"
                    >
                      <div className="flex gap-4">
                        <img
                          src={getVendorImage(booking.vendorId)}
                          alt={booking.vendorId?.businessName || "Vendor"}
                          className="h-16 w-16 rounded-2xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-extrabold">
                            {booking.vendorId?.businessName ||
                              "Vendor unavailable"}
                          </p>
                          <p className="mt-1 text-sm text-ink/45">
                            {booking.eventType}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-ink/60">
                            {formatDate(booking.eventDate)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                            statusClass[booking.status]
                          }`}
                        >
                          {booking.status}
                        </span>
                        <button
                          type="button"
                          disabled={updatingId === booking._id}
                          onClick={() => cancelBooking(booking._id)}
                          className="text-xs font-bold text-red-500 disabled:opacity-50"
                        >
                          {updatingId === booking._id ? "Cancelling…" : "Cancel"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState
                    title="No upcoming bookings"
                    description="Browse vendors and send a request when you are ready."
                    actionLabel="Explore vendors"
                    actionTo="/vendors"
                  />
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Saved vendors</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Vendors you shortlisted.
                </p>
              </div>
              <div className="space-y-3 p-5">
                {favorites.length ? (
                  favorites.slice(0, 4).map((favorite) => {
                    const vendor = favorite.vendorId;
                    return (
                      <div
                        key={favorite._id}
                        className="flex items-center gap-3 rounded-2xl border border-ink/8 p-3"
                      >
                        <img
                          src={getVendorImage(vendor)}
                          alt={vendor.businessName}
                          className="h-14 w-14 rounded-2xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold">
                            {vendor.businessName}
                          </p>
                          <p className="text-xs text-ink/45">
                            {vendor.serviceCategory || vendor.category}
                          </p>
                        </div>
                        <Heart className="h-4 w-4 fill-coral text-coral" />
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-2xl bg-sand/50 p-5 text-sm text-ink/50">
                    No saved vendors yet.
                  </p>
                )}
                <Button to="/customer/favorites" variant="outline" className="w-full">
                  View all saved vendors
                </Button>
              </div>
            </Card>
          </section>

          <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Booking history</h2>
                <p className="mt-1 text-sm text-ink/45">
                  All booking requests and review actions.
                </p>
              </div>

              {bookings.length ? (
                <div className="divide-y">
                  {bookings.map((booking) => (
                    <div
                      key={booking._id}
                      className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.7fr_0.7fr_auto] md:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={getVendorImage(booking.vendorId)}
                          alt={booking.vendorId?.businessName || "Vendor"}
                          className="h-12 w-12 rounded-2xl object-cover"
                        />
                        <div>
                          <p className="font-extrabold">
                            {booking.vendorId?.businessName ||
                              "Vendor unavailable"}
                          </p>
                          <p className="text-xs text-ink/40">
                            {booking.eventType}
                          </p>
                        </div>
                      </div>
                      <p className="flex items-center gap-2 text-sm text-ink/50">
                        <MapPin className="h-4 w-4" />{" "}
                        {formatDate(booking.eventDate)}
                      </p>
                      <div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                            statusClass[booking.status]
                          }`}
                        >
                          {booking.status}
                        </span>
                        <p className="mt-2 flex items-center text-sm font-bold">
                          <IndianRupee className="h-3.5 w-3.5" />
                          {formatCurrency(booking.budget).replace("₹", "")}
                        </p>
                      </div>
                      <div className="flex justify-start gap-3 md:justify-end">
                        {booking.status === "completed" &&
                          (reviewsByBooking[booking._id] ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setReviewBooking(booking)}
                                className="flex items-center gap-1 text-xs font-bold text-coral"
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                disabled={
                                  updatingId ===
                                  reviewsByBooking[booking._id]._id
                                }
                                onClick={() => removeReview(booking._id)}
                                className="flex items-center gap-1 text-xs font-bold text-red-500 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReviewBooking(booking)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-coral"
                            >
                              <Star className="h-3.5 w-3.5" /> Review
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
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
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Reviews given</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Reviews from completed bookings.
                </p>
              </div>
              <div className="space-y-4 p-5">
                {reviewsGiven.length ? (
                  reviewsGiven.map((review) => (
                    <article
                      key={review._id}
                      className="rounded-3xl border border-ink/8 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-extrabold">
                          {review.vendorId?.businessName || "Vendor"}
                        </p>
                        <span className="flex gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((item) => (
                            <Star
                              key={item}
                              className={`h-4 w-4 ${
                                item <= review.rating
                                  ? "fill-current"
                                  : "text-ink/15"
                              }`}
                            />
                          ))}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink/55">
                        {review.comment}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl bg-sand/50 p-5 text-sm text-ink/50">
                    Reviews you write will appear here.
                  </p>
                )}
              </div>
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="border-b p-6">
              <h2 className="text-xl font-extrabold">Account settings</h2>
              <p className="mt-1 text-sm text-ink/45">
                Preferences and account controls.
              </p>
            </div>
            <div className="grid lg:grid-cols-[260px_1fr]">
              <div className="border-b p-4 lg:border-b-0 lg:border-r">
                <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">
                  {settingsTabs.map(([label, Icon]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSettingsTab(label)}
                      className={`flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition lg:w-full ${
                        settingsTab === label
                          ? "bg-ink text-white"
                          : "text-ink/55 hover:bg-sand/70"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["Name", user?.name || "Not set"],
                    ["Email", user?.email || "Not set"],
                    ["Phone", user?.phone || "Not set"],
                    ["Current tab", settingsTab],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-ink/8 p-4">
                      <p className="text-xs font-bold text-ink/40">{label}</p>
                      <p className="mt-2 font-extrabold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {reviewBooking && (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-xl rounded-[2rem] bg-cream p-6 shadow-lift sm:p-8">
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
