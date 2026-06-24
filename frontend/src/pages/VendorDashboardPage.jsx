import {
  BadgeCheck,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  ImagePlus,
  IndianRupee,
  Inbox,
  Layers3,
  MapPin,
  MessageSquare,
  PackageCheck,
  Star,
  TrendingUp,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  getVendorRequests,
  updateBookingStatus,
} from "../services/bookingService";
import {
  getVendorReviews,
  replyToReview,
} from "../services/reviewService";
import { getMyVendorProfile } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

const statusMeta = {
  pending: {
    title: "Pending",
    className: "bg-amber-100 text-amber-700",
  },
  accepted: {
    title: "Accepted",
    className: "bg-sage/15 text-sage",
  },
  completed: {
    title: "Completed",
    className: "bg-ink/6 text-ink/55",
  },
  rejected: {
    title: "Rejected / Cancelled",
    className: "bg-red-50 text-red-600",
  },
  cancelled: {
    title: "Rejected / Cancelled",
    className: "bg-red-50 text-red-600",
  },
};

const initials = (name = "PZ") =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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

export default function VendorDashboardPage() {
  useDocumentTitle("Vendor dashboard");
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [replyingId, setReplyingId] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});

  useEffect(() => {
    Promise.allSettled([getVendorRequests(), getMyVendorProfile()])
      .then(async ([bookingResult, profileResult]) => {
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
      })
      .finally(() => {
        setLoading(false);
        setReviewsLoading(false);
      });
  }, []);

  const stats = useMemo(() => {
    const pending = requests.filter((item) => item.status === "pending").length;
    const accepted = requests.filter((item) => item.status === "accepted").length;
    const completed = requests.filter((item) => item.status === "completed").length;
    const earnings = requests
      .filter((item) => item.status === "completed")
      .reduce((total, item) => total + item.budget, 0);

    return {
      pending,
      accepted,
      completed,
      earnings,
      averageRating: profile?.averageRating || profile?.rating || 0,
      reviewCount: profile?.reviewCount ?? profile?.reviewsCount ?? reviews.length,
    };
  }, [requests, profile, reviews.length]);

  const groupedRequests = useMemo(
    () => [
      ["pending", requests.filter((item) => item.status === "pending")],
      ["accepted", requests.filter((item) => item.status === "accepted")],
      ["completed", requests.filter((item) => item.status === "completed")],
      [
        "rejected",
        requests.filter((item) => ["rejected", "cancelled"].includes(item.status)),
      ],
    ],
    [requests],
  );

  const profileStrength = useMemo(() => {
    const checks = [
      profile?.businessName,
      profile?.serviceCategory,
      profile?.location,
      profile?.description,
      profile?.pricing,
      profile?.portfolioImages?.length,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
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

  const statCards = [
    [Inbox, "Total requests", requests.length, "All customer inquiries"],
    [Clock3, "Pending requests", stats.pending, "Needs your response"],
    [CalendarCheck, "Accepted bookings", stats.accepted, "Upcoming work"],
    [CheckCircle2, "Completed", stats.completed, formatCurrency(stats.earnings)],
    [
      Star,
      "Average rating",
      stats.averageRating || "New",
      `${stats.reviewCount} reviews`,
    ],
    [MessageSquare, "Total reviews", stats.reviewCount, "Customer feedback"],
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

      <section className="overflow-hidden rounded-[2rem] border bg-white shadow-soft">
        <div className="bg-gradient-to-r from-[#fff3eb] via-white to-[#f4eadf] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <img
                src={profile ? getVendorImage(profile) : undefined}
                alt={profile?.businessName || user?.name}
                className="h-24 w-24 rounded-3xl bg-sand object-cover shadow-soft"
              />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                  Vendor business center
                </p>
                <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl font-extrabold">
                  {profile?.businessName || `Welcome, ${user?.name?.split(" ")[0]}`}
                  {profile?.verified && (
                    <BadgeCheck className="h-6 w-6 fill-coral text-white" />
                  )}
                </h1>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/55">
                  <span>{profile?.serviceCategory || "Profile not completed"}</span>
                  {profile?.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" /> {profile.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {stats.averageRating || "New"} · {stats.reviewCount} reviews
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button to="/vendor/profile-setup" variant="outline">
                <Edit3 className="h-4 w-4" />
                {profile ? "Edit Profile" : "Complete Profile"}
              </Button>
              {profile && (
                <Button to={`/vendors/${profile._id}`}>
                  <Eye className="h-4 w-4" /> View Public Profile
                </Button>
              )}
            </div>
          </div>

          <div className="mt-7 rounded-3xl bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold">Profile completion</p>
                <p className="mt-1 text-xs text-ink/45">
                  Strong profiles get better-quality booking requests.
                </p>
              </div>
              <span className="text-2xl font-extrabold text-coral">
                {profile ? profileStrength : 0}%
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand">
              <span
                className="block h-full rounded-full bg-coral"
                style={{ width: `${profile ? profileStrength : 0}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {!profile && (
            <div className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
              Complete your vendor profile before customers can confidently book you.
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {statCards.map(([Icon, title, value, note]) => (
              <Card key={title} className="p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-plum/10 text-plum">
                    <Icon className="h-5 w-5" />
                  </span>
                  <TrendingUp className="h-4 w-4 text-sage" />
                </div>
                <p className="mt-5 text-2xl font-extrabold">{value}</p>
                <p className="mt-1 text-sm font-bold text-ink/55">{title}</p>
                <p className="mt-2 text-xs text-ink/40">{note}</p>
              </Card>
            ))}
          </section>

          <section className="grid gap-8 xl:grid-cols-[1fr_340px]">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-extrabold">Booking pipeline</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Manage every request by status without losing context.
                </p>
              </div>

              {requests.length ? (
                groupedRequests.map(([status, items]) => (
                  <Card key={status} className="overflow-hidden">
                    <div className="flex items-center justify-between border-b p-5">
                      <h3 className="text-lg font-extrabold">
                        {statusMeta[status].title}
                      </h3>
                      <span className="rounded-full bg-sand px-3 py-1 text-xs font-extrabold text-ink/55">
                        {items.length}
                      </span>
                    </div>

                    {items.length ? (
                      <div className="grid gap-4 p-5 lg:grid-cols-2">
                        {items.map((request) => (
                          <article
                            key={request._id}
                            className="rounded-3xl border border-ink/8 p-5"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-extrabold">
                                  {request.customerId?.name || "Customer"}
                                </p>
                                <p className="mt-1 text-sm text-ink/45">
                                  {request.eventType}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                                  statusMeta[request.status]?.className ||
                                  "bg-ink/5 text-ink/50"
                                }`}
                              >
                                {request.status}
                              </span>
                            </div>
                            <div className="mt-5 grid gap-3 text-sm text-ink/55">
                              <span className="flex items-center gap-2">
                                <CalendarCheck className="h-4 w-4" />
                                {formatDate(request.eventDate)}
                              </span>
                              <span className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                {request.eventLocation}
                              </span>
                              <span className="flex items-center gap-2 font-bold text-ink">
                                <IndianRupee className="h-4 w-4" />
                                {formatCurrency(request.budget).replace("₹", "")}
                              </span>
                            </div>
                            {request.specialRequirements && (
                              <p className="mt-4 line-clamp-2 rounded-2xl bg-sand/50 p-3 text-sm text-ink/55">
                                {request.specialRequirements}
                              </p>
                            )}
                            <div className="mt-5 flex flex-wrap gap-2">
                              {request.status === "pending" && (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={updatingId === request._id}
                                    onClick={() =>
                                      changeStatus(request._id, "rejected")
                                    }
                                    className="!px-4 !py-2"
                                  >
                                    <XCircle className="h-4 w-4" /> Reject
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled={updatingId === request._id}
                                    onClick={() =>
                                      changeStatus(request._id, "accepted")
                                    }
                                    className="!px-4 !py-2"
                                  >
                                    <Check className="h-4 w-4" /> Accept
                                  </Button>
                                </>
                              )}
                              {request.status === "accepted" && (
                                <Button
                                  type="button"
                                  disabled={updatingId === request._id}
                                  onClick={() =>
                                    changeStatus(request._id, "completed")
                                  }
                                  className="!px-4 !py-2"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Mark Completed
                                </Button>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-sm text-ink/45">
                        No {statusMeta[status].title.toLowerCase()} bookings.
                      </div>
                    )}
                  </Card>
                ))
              ) : (
                <EmptyState
                  title="No booking requests"
                  description="New customer requests will appear here."
                />
              )}
            </div>

            <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
              <Card className="p-6">
                <h2 className="text-xl font-extrabold">Quick actions</h2>
                <div className="mt-5 space-y-3">
                  {[
                    [Edit3, "Complete profile", "/vendor/profile-setup"],
                    [Upload, "Upload portfolio images", "/vendor/profile-setup#portfolio"],
                    [Layers3, "Manage services", "/vendor/profile-setup"],
                    [Inbox, "Check booking requests", "/vendor/dashboard?view=requests"],
                    [Eye, "View public profile", profile ? `/vendors/${profile._id}` : "/vendors"],
                  ].map(([Icon, label, to]) => (
                    <Button
                      key={label}
                      to={to}
                      variant="outline"
                      className="w-full !justify-start"
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </Button>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-extrabold">Profile strength</h2>
                <p className="mt-2 text-sm text-ink/45">
                  {profileStrength}% complete based on profile, pricing, and
                  portfolio fields.
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-sand">
                  <span
                    className="block h-full rounded-full bg-coral"
                    style={{ width: `${profileStrength}%` }}
                  />
                </div>
                <div className="mt-5 space-y-2 text-sm text-ink/55">
                  {[
                    ["Business name", profile?.businessName],
                    ["Category", profile?.serviceCategory],
                    ["Location", profile?.location],
                    ["Bio", profile?.description],
                    ["Portfolio", profile?.portfolioImages?.length],
                    ["Pricing", profile?.pricing],
                  ].map(([label, done]) => (
                    <p key={label} className="flex items-center justify-between">
                      <span>{label}</span>
                      <Check
                        className={`h-4 w-4 ${
                          done ? "text-sage" : "text-ink/20"
                        }`}
                      />
                    </p>
                  ))}
                </div>
              </Card>
            </aside>
          </section>

          {profile && (
            <Card className="overflow-hidden">
              <div className="border-b p-6">
                <h2 className="text-xl font-extrabold">Reviews & replies</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Reply publicly to customer feedback from completed bookings.
                </p>
              </div>

              {reviewsLoading ? (
                <div className="p-8 text-center text-sm text-ink/45">
                  Loading reviews…
                </div>
              ) : reviews.length ? (
                <div className="grid gap-4 p-5 lg:grid-cols-2">
                  {reviews.map((review) => (
                    <article
                      key={review._id}
                      className="rounded-3xl border border-ink/8 p-5"
                    >
                      <div className="flex items-start gap-4">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-sand text-sm font-extrabold">
                          {initials(review.customerId?.name)}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-extrabold">
                                {review.customerId?.name || "Customer"}
                              </p>
                              <p className="text-xs text-ink/40">
                                {formatDate(review.createdAt)}
                              </p>
                            </div>
                            <Stars value={review.rating} />
                          </div>
                          <p className="mt-4 text-sm leading-6 text-ink/60">
                            {review.comment}
                          </p>
                          {review.vendorReply?.message ? (
                            <div className="mt-4 rounded-2xl bg-sand/60 p-4">
                              <p className="text-xs font-extrabold uppercase tracking-wider text-coral">
                                Your reply
                              </p>
                              <p className="mt-2 text-sm text-ink/60">
                                {review.vendorReply.message}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-4">
                              <textarea
                                value={replyDrafts[review._id] || ""}
                                onChange={(event) =>
                                  setReplyDrafts((current) => ({
                                    ...current,
                                    [review._id]: event.target.value,
                                  }))
                                }
                                className="field min-h-24 resize-none"
                                placeholder="Write a thoughtful reply…"
                              />
                              <Button
                                type="button"
                                loading={replyingId === review._id}
                                disabled={
                                  replyingId === review._id ||
                                  !replyDrafts[review._id]?.trim()
                                }
                                onClick={() => saveReply(review._id)}
                                className="mt-3"
                              >
                                Save reply
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState
                    title="No reviews yet"
                    description="Customer reviews will appear after completed bookings."
                  />
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
