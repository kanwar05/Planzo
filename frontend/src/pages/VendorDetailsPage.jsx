import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  ImageIcon,
  Languages,
  MapPin,
  MessageCircle,
  PackageCheck,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendorReviews } from "../services/reviewService";
import { getVendorById } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";
import { getVendorGallery, getVendorImage } from "../utils/vendor";

const serviceIcons = [Sparkles, PackageCheck, ShieldCheck];

const serviceCopy = [
  {
    title: "Event planning & coordination",
    description:
      "A structured plan for timelines, vendor coordination, styling notes, and event-day execution.",
  },
  {
    title: "Custom celebration setup",
    description:
      "Personalized setup recommendations based on your event type, venue, guest count, and budget.",
  },
  {
    title: "On-site support",
    description:
      "Reliable team support to keep the event flow smooth, polished, and stress-free.",
  },
];

const packages = [
  {
    name: "Basic",
    multiplier: 1,
    features: ["Discovery call", "Event checklist", "Basic vendor guidance"],
  },
  {
    name: "Standard",
    multiplier: 1.7,
    recommended: true,
    features: ["Planning roadmap", "Timeline support", "Two revision rounds"],
  },
  {
    name: "Premium",
    multiplier: 2.8,
    features: ["Full event concept", "Priority support", "Dedicated coordinator"],
  },
];

const availability = Array.from({ length: 30 }, (_, index) => {
  const day = index + 1;
  return {
    day,
    booked: [3, 8, 14, 19, 25, 29].includes(day),
  };
});

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

export default function VendorDetailsPage() {
  const { id } = useParams();
  const [vendor, setVendor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewsError, setReviewsError] = useState("");
  const [lightboxImage, setLightboxImage] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("Standard");
  useDocumentTitle(vendor?.businessName || "Vendor profile");

  useEffect(() => {
    Promise.allSettled([getVendorById(id), getVendorReviews(id, { limit: 50 })])
      .then(([vendorResult, reviewsResult]) => {
        if (vendorResult.status === "fulfilled") {
          setVendor(vendorResult.value);
        } else {
          setError(
            getApiError(vendorResult.reason, "Unable to load this vendor."),
          );
        }

        if (reviewsResult.status === "fulfilled") {
          setReviews(reviewsResult.value.reviews);
        } else {
          setReviewsError(
            getApiError(reviewsResult.reason, "Unable to load reviews."),
          );
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const profile = useMemo(() => {
    if (!vendor) return null;

    const gallery = getVendorGallery(vendor);
    const rating = vendor.averageRating || vendor.rating || 0;
    const reviewCount = vendor.reviewCount ?? vendor.reviewsCount ?? reviews.length;
    const basePrice = vendor.pricing || 0;

    return {
      gallery,
      cover: gallery[0],
      avatar: getVendorImage(vendor),
      rating,
      reviewCount,
      basePrice,
      teamSize: Math.max(2, Math.min(12, Number(vendor.experience || 1) + 2)),
      languages: ["English", "Hindi"],
    };
  }, [vendor, reviews]);

  const ratingBars = useMemo(() => {
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((rating) => {
      const count = reviews.filter((review) => review.rating === rating).length;
      return { rating, count, width: `${Math.round((count / total) * 100)}%` };
    });
  }, [reviews]);

  if (loading) {
    return (
      <section className="section-pad container-shell">
        <LoadingSkeleton />
      </section>
    );
  }

  if (error || !vendor || !profile) {
    return (
      <section className="section-pad container-shell">
        <EmptyState
          title="Vendor unavailable"
          description={error || "This vendor profile could not be found."}
        />
      </section>
    );
  }

  const packageCards = packages.map((item) => ({
    ...item,
    price: Math.max(
      profile.basePrice,
      Math.round((profile.basePrice * item.multiplier) / 1000) * 1000,
    ),
  }));

  const services = serviceCopy.map((item, index) => ({
    ...item,
    Icon: serviceIcons[index],
    price: Math.max(profile.basePrice, 0),
  }));

  return (
    <main className="bg-[#fbf7f1]">
      <section className="border-b border-ink/8 bg-gradient-to-br from-[#fff8ef] via-white to-[#f4eadf]">
        <div className="container-shell py-5">
          <Button to="/vendors" variant="ghost" className="!px-0">
            <ChevronLeft className="h-4 w-4" /> Back to vendors
          </Button>

          <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <div className="relative h-64 overflow-hidden rounded-[2rem] bg-sand shadow-soft sm:h-80">
                <img
                  src={profile.cover}
                  alt={vendor.businessName}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/45 to-transparent" />
              </div>
              <div className="-mt-12 flex flex-col gap-5 px-3 sm:flex-row sm:items-end sm:px-6">
                <img
                  src={profile.avatar}
                  alt={vendor.businessName}
                  className="relative h-28 w-28 rounded-full border-4 border-white object-cover shadow-lift"
                />
                <div className="relative flex-1 rounded-3xl bg-white p-5 shadow-soft">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                        {vendor.serviceCategory}
                      </p>
                      <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl font-extrabold sm:text-4xl">
                        {vendor.businessName}
                        {vendor.verified && (
                          <BadgeCheck className="h-6 w-6 fill-coral text-white" />
                        )}
                      </h1>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink/55">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" /> {vendor.location}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {profile.rating || "New"} · {profile.reviewCount} reviews
                        </span>
                      </div>
                    </div>
                    {vendor.verified && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/12 px-3 py-1.5 text-xs font-extrabold text-sage">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-5 shadow-soft">
              <p className="text-sm text-ink/45">Start planning with</p>
              <p className="mt-1 text-2xl font-extrabold">
                {formatCurrency(profile.basePrice)}
              </p>
              <div className="mt-5 grid gap-3">
                <Button to={`/booking/${vendor._id}`} className="w-full">
                  <CalendarDays className="h-4 w-4" /> Request Booking
                </Button>
                <Button
                  to={`mailto:${vendor.userId?.email || ""}`}
                  variant="outline"
                  className="w-full"
                >
                  <MessageCircle className="h-4 w-4" /> Message Vendor
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigator.clipboard?.writeText(window.location.href)}
                  className="w-full"
                >
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-shell grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          <section className="rounded-[2rem] bg-white p-6 shadow-soft">
            <h2 className="text-2xl font-extrabold">Overview</h2>
            <p className="mt-4 max-w-3xl leading-8 text-ink/60">
              {vendor.description}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Experience", `${vendor.experience || 0}+ years`, Clock3],
                ["Languages", profile.languages.join(", "), Languages],
                ["Team size", `${profile.teamSize} people`, Users],
                ["Location", vendor.location, MapPin],
              ].map(([label, value, Icon]) => (
                <div key={label} className="rounded-2xl border border-ink/8 p-4">
                  <Icon className="h-5 w-5 text-coral" />
                  <p className="mt-4 text-sm font-bold text-ink/45">{label}</p>
                  <p className="mt-1 font-extrabold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-soft">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                  Portfolio
                </p>
                <h2 className="mt-2 text-2xl font-extrabold">Recent work</h2>
              </div>
              <p className="text-sm font-bold text-ink/45">
                {profile.gallery.length} photos
              </p>
            </div>
            <div className="mt-6 grid auto-rows-[170px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profile.gallery.slice(0, 7).map((image, index) => (
                <motion.button
                  key={image}
                  type="button"
                  whileHover={{ y: -3 }}
                  onClick={() => setLightboxImage(image)}
                  className={`group relative overflow-hidden rounded-3xl bg-sand ${
                    index === 0 ? "sm:col-span-2 sm:row-span-2" : ""
                  }`}
                >
                  <img
                    src={image}
                    alt={`Portfolio ${index + 1}`}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold opacity-0 shadow-soft transition group-hover:opacity-100">
                    <ImageIcon className="h-3.5 w-3.5" /> Preview
                  </span>
                </motion.button>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-soft">
            <h2 className="text-2xl font-extrabold">Services offered</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {services.map(({ Icon, title, description, price }) => (
                <article key={title} className="rounded-3xl border border-ink/8 p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-extrabold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-ink/55">
                    {description}
                  </p>
                  <p className="mt-5 text-sm font-extrabold">
                    Starts at {formatCurrency(price)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-soft">
            <h2 className="text-2xl font-extrabold">Packages</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {packageCards.map((item) => (
                <article
                  key={item.name}
                  className={`relative rounded-3xl border p-5 ${
                    item.recommended
                      ? "border-coral shadow-lift"
                      : "border-ink/8 shadow-soft"
                  }`}
                >
                  {item.recommended && (
                    <span className="absolute right-4 top-4 rounded-full bg-coral px-3 py-1 text-[11px] font-extrabold text-white">
                      Recommended
                    </span>
                  )}
                  <h3 className="text-lg font-extrabold">{item.name}</h3>
                  <p className="mt-4 text-3xl font-extrabold">
                    {formatCurrency(item.price)}
                  </p>
                  <div className="mt-5 space-y-3">
                    {item.features.map((feature) => (
                      <p key={feature} className="flex items-center gap-2 text-sm text-ink/60">
                        <Check className="h-4 w-4 text-sage" /> {feature}
                      </p>
                    ))}
                  </div>
                  <Button
                    to={`/booking/${vendor._id}`}
                    variant={item.recommended ? "primary" : "outline"}
                    className="mt-6 w-full"
                  >
                    Request {item.name}
                  </Button>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-soft">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-extrabold">Reviews</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Real customer reviews from completed bookings.
                </p>
              </div>
              {reviewsError && (
                <p className="rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-600">
                  {reviewsError}
                </p>
              )}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
              <div className="rounded-3xl border border-ink/8 p-5">
                <p className="text-5xl font-extrabold">
                  {profile.rating || "New"}
                </p>
                <div className="mt-3">
                  <Stars value={profile.rating} />
                </div>
                <p className="mt-2 text-sm text-ink/45">
                  {profile.reviewCount} reviews
                </p>
                <div className="mt-6 space-y-3">
                  {ratingBars.map((item) => (
                    <div key={item.rating} className="grid grid-cols-[28px_1fr_24px] items-center gap-2 text-xs font-bold">
                      <span>{item.rating}★</span>
                      <span className="h-2 overflow-hidden rounded-full bg-ink/8">
                        <span
                          className="block h-full rounded-full bg-amber-400"
                          style={{ width: item.width }}
                        />
                      </span>
                      <span className="text-right text-ink/40">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {reviews.length ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <article key={review._id} className="rounded-3xl border border-ink/8 p-5">
                      <div className="flex items-start gap-4">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-sand text-sm font-extrabold">
                          {initials(review.customerId?.name)}
                        </span>
                        <div className="flex-1">
                          <div className="flex flex-wrap justify-between gap-3">
                            <div>
                              <p className="font-extrabold">
                                {review.customerId?.name || "Planzo customer"}
                              </p>
                              <p className="text-xs text-ink/40">
                                {review.bookingId?.eventType || "Event"} · {formatDate(review.createdAt)}
                              </p>
                            </div>
                            <Stars value={review.rating} />
                          </div>
                          <p className="mt-4 text-sm leading-7 text-ink/60">
                            {review.comment}
                          </p>
                          {!!review.images?.length && (
                            <div className="mt-4 flex gap-2 overflow-x-auto">
                              {review.images.map((image) => (
                                <button
                                  key={image.url}
                                  type="button"
                                  onClick={() => setLightboxImage(image.url)}
                                >
                                  <img
                                    src={image.url}
                                    alt=""
                                    className="h-20 w-24 rounded-2xl object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                          {review.vendorReply?.message && (
                            <div className="mt-4 rounded-2xl bg-[#fbf7f1] p-4">
                              <p className="text-xs font-extrabold uppercase tracking-wider text-coral">
                                Vendor reply
                              </p>
                              <p className="mt-2 text-sm leading-6 text-ink/60">
                                {review.vendorReply.message}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-ink/15 p-8 text-center">
                  <p className="font-extrabold">No reviews yet</p>
                  <p className="mt-2 text-sm text-ink/45">
                    Reviews from completed bookings will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-soft">
            <h2 className="text-2xl font-extrabold">Availability preview</h2>
            <div className="mt-5 grid grid-cols-7 gap-2">
              {availability.map((item) => (
                <span
                  key={item.day}
                  className={`grid aspect-square place-items-center rounded-2xl text-sm font-extrabold ${
                    item.booked ? "bg-red-50 text-red-500" : "bg-sage/12 text-sage"
                  }`}
                >
                  {item.day}
                </span>
              ))}
            </div>
            <div className="mt-5 flex gap-5 text-xs font-bold text-ink/45">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-sage" /> Available
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-400" /> Booked
              </span>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[2rem] bg-white p-6 shadow-lift">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-ink/45">Starting price</p>
                <p className="mt-1 text-3xl font-extrabold">
                  {formatCurrency(profile.basePrice)}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-extrabold">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {profile.rating || "New"}
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <label>
                <span className="label">Event date</span>
                <input type="date" className="field" />
              </label>
              <label>
                <span className="label">Package</span>
                <select
                  value={selectedPackage}
                  onChange={(event) => setSelectedPackage(event.target.value)}
                  className="field"
                >
                  {packageCards.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Short message</span>
                <textarea
                  className="field min-h-28 resize-none"
                  placeholder="Tell the vendor about your event, guest count, location, and expectations."
                />
              </label>
            </div>

            <Button to={`/booking/${vendor._id}`} className="mt-5 w-full">
              <Send className="h-4 w-4" /> Request Booking
            </Button>

            <div className="mt-6 space-y-3 border-t pt-5">
              {[
                "Verified vendor profile",
                "Fast response expected",
                "Secure booking through Planzo",
              ].map((point) => (
                <p key={point} className="flex items-center gap-2 text-sm font-semibold text-ink/60">
                  <Check className="h-4 w-4 text-sage" /> {point}
                </p>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {lightboxImage && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLightboxImage("")}
            className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full bg-white text-ink"
            aria-label="Close image preview"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Portfolio preview"
            className="max-h-[85vh] max-w-full rounded-[2rem] object-contain shadow-lift"
          />
        </div>
      )}
    </main>
  );
}
