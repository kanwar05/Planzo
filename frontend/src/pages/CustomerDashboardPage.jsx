import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Eye,
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
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
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
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
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
    [CalendarCheck, "Total bookings", stats.total, "All booking requests"],
    [CheckCircle2, "Completed", stats.completed, "Finished celebrations"],
    [CalendarClock, "Pending", stats.pending, "Awaiting vendor reply"],
    [XCircle, "Cancelled", stats.cancelled, "Closed requests"],
  ];

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

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-8">
            <section className="overflow-hidden rounded-[2rem] border bg-white shadow-soft">
              <div className="bg-gradient-to-r from-[#fff3eb] via-white to-[#f8efe6] p-6 sm:p-8">
                <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                  <div className="flex items-center gap-5">
                    <span className="grid h-20 w-20 place-items-center rounded-full bg-coral text-2xl font-extrabold text-white shadow-soft">
                      {initials(user?.name)}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                          Customer account
                        </p>
                        <span className="rounded-full bg-sage/15 px-3 py-1 text-[11px] font-extrabold text-sage">
                          Active
                        </span>
                      </div>
                      <h1 className="mt-2 text-3xl font-extrabold">
                        {user?.name}
                      </h1>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink/55">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-4 w-4" /> {user?.email}
                        </span>
                        <span>
                          Member since{" "}
                          {user?.createdAt
                            ? formatDate(user.createdAt)
                            : "recently"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSettingsTab("Personal Information")}
                    >
                      <Edit3 className="h-4 w-4" /> Edit Profile
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSettingsTab("Security")}
                    >
                      <LockKeyhole className="h-4 w-4" /> Change Password
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b p-6">
                <div>
                  <h2 className="text-xl font-extrabold">Upcoming bookings</h2>
                  <p className="mt-1 text-sm text-ink/45">
                    Your active event plans and pending requests.
                  </p>
                </div>
                <Button to="/vendors" variant="ghost" className="hidden sm:flex">
                  Explore vendors
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
                          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ink/60">
                            <MapPin className="h-4 w-4" />
                            {booking.eventLocation}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">
                            {formatDate(booking.eventDate)}
                          </p>
                          <span
                            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                              statusClass[booking.status]
                            }`}
                          >
                            {booking.status}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            to={`/vendors/${booking.vendorId?._id}`}
                            variant="ghost"
                            className="!px-3 !py-2"
                          >
                            <Eye className="h-4 w-4" /> View
                          </Button>
                          {["pending", "accepted"].includes(booking.status) && (
                            <button
                              type="button"
                              disabled={updatingId === booking._id}
                              onClick={() => cancelBooking(booking._id)}
                              className="text-xs font-bold text-red-500 disabled:opacity-50"
                            >
                              {updatingId === booking._id
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
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
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Booking history</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Desktop table, mobile-friendly rows, and review actions.
                </p>
              </div>

              {bookings.length ? (
                <div className="overflow-x-auto">
                  <table className="hidden min-w-full text-left text-sm md:table">
                    <thead className="bg-sand/50 text-xs uppercase tracking-wider text-ink/45">
                      <tr>
                        <th className="px-5 py-4">Vendor</th>
                        <th className="px-5 py-4">Event</th>
                        <th className="px-5 py-4">Date</th>
                        <th className="px-5 py-4">Budget</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {bookings.map((booking) => (
                        <tr key={booking._id}>
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
                            {formatDate(booking.eventDate)}
                          </td>
                          <td className="px-5 py-4 font-bold">
                            {formatCurrency(booking.budget)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                                statusClass[booking.status]
                              }`}
                            >
                              {booking.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            {booking.status === "completed" &&
                              (reviewsByBooking[booking._id] ? (
                                <div className="flex justify-end gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setReviewBooking(booking)}
                                    className="text-xs font-bold text-coral"
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
                                    className="text-xs font-bold text-red-500 disabled:opacity-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setReviewBooking(booking)}
                                  className="text-xs font-bold text-coral"
                                >
                                  Review
                                </button>
                              ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="grid gap-4 p-5 md:hidden">
                    {bookings.map((booking) => (
                      <article
                        key={booking._id}
                        className="rounded-3xl border border-ink/8 p-4"
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
                            <p className="text-sm text-ink/45">
                              {booking.eventType}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <div>
                            <p className="text-sm">{formatDate(booking.eventDate)}</p>
                            <p className="mt-1 font-bold">
                              {formatCurrency(booking.budget)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                              statusClass[booking.status]
                            }`}
                          >
                            {booking.status}
                          </span>
                        </div>
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
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Reviews given</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Feedback you shared after completed bookings.
                </p>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
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
                      <p className="mt-3 text-xs text-ink/35">
                        {formatDate(review.createdAt)}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl bg-sand/50 p-5 text-sm text-ink/50 md:col-span-2">
                    Reviews you write will appear here.
                  </p>
                )}
              </div>
            </Card>
          </main>

          <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <Card className="p-6">
              <h2 className="text-xl font-extrabold">Booking stats</h2>
              <div className="mt-5 grid gap-3">
                {statCards.map(([Icon, title, value, note]) => (
                  <div
                    key={title}
                    className="flex items-center gap-4 rounded-2xl border border-ink/8 p-4"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xl font-extrabold">{value}</p>
                      <p className="text-sm font-bold text-ink/55">{title}</p>
                      <p className="text-xs text-ink/35">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Saved vendors</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Your event shortlist.
                </p>
              </div>
              <div className="space-y-3 p-5">
                {favorites.length ? (
                  favorites.slice(0, 4).map((favorite) => {
                    const vendor = favorite.vendorId;
                    return (
                      <Button
                        key={favorite._id}
                        to={`/vendors/${vendor._id}`}
                        variant="ghost"
                        className="w-full !justify-start rounded-2xl border border-ink/8 !px-3 !py-3"
                      >
                        <img
                          src={getVendorImage(vendor)}
                          alt={vendor.businessName}
                          className="h-12 w-12 rounded-2xl object-cover"
                        />
                        <span className="min-w-0 text-left">
                          <span className="block truncate text-sm font-extrabold">
                            {vendor.businessName}
                          </span>
                          <span className="block text-xs text-ink/45">
                            {vendor.serviceCategory || vendor.category}
                            {(vendor.averageRating || vendor.rating) && (
                              <> · ★ {vendor.averageRating || vendor.rating}</>
                            )}
                          </span>
                        </span>
                      </Button>
                    );
                  })
                ) : (
                  <p className="rounded-2xl bg-sand/50 p-5 text-sm text-ink/50">
                    No saved vendors yet.
                  </p>
                )}
                <Button to="/customer/favorites" variant="outline" className="w-full">
                  <Heart className="h-4 w-4" /> Manage saved vendors
                </Button>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Account settings</h2>
              </div>
              <div className="p-4">
                <div className="grid gap-2">
                  {settingsTabs.map(([label, Icon]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSettingsTab(label)}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                        settingsTab === label
                          ? "bg-ink text-white"
                          : "text-ink/55 hover:bg-sand/70"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
                {settingsTab === "Personal Information" && (
                  <form onSubmit={saveProfile} className="mt-4 space-y-4 rounded-2xl bg-sand/50 p-4">
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
                  <form onSubmit={savePassword} className="mt-4 space-y-4 rounded-2xl bg-sand/50 p-4">
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
                  <form onSubmit={saveNotifications} className="mt-4 space-y-4 rounded-2xl bg-sand/50 p-4">
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
                  <form onSubmit={removeAccount} className="mt-4 space-y-4 rounded-2xl bg-red-50 p-4">
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
            </Card>
          </aside>
        </div>
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
