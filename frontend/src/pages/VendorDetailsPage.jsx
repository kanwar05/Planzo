import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock3,
  Heart,
  MapPin,
  Share2,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ReviewList from "../components/ReviewList";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  addFavorite,
  checkFavorite,
  removeFavorite,
} from "../services/favoriteService";
import { getVendorById } from "../services/vendorService";
import { getVendorReviews } from "../services/reviewService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";
import { getVendorGallery } from "../utils/vendor";

export default function VendorDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteSuccess, setFavoriteSuccess] = useState("");
  useDocumentTitle(vendor?.businessName || "Vendor details");

  useEffect(() => {
    const requests = [getVendorById(id), getVendorReviews(id)];
    if (isAuthenticated && user?.role === "customer") {
      requests.push(checkFavorite(id));
    }

    Promise.allSettled(requests)
      .then(([vendorResult, reviewsResult, favoriteResult]) => {
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

        if (favoriteResult?.status === "fulfilled") {
          setIsFavorited(favoriteResult.value);
        }
      })
      .finally(() => {
        setLoading(false);
        setReviewsLoading(false);
      });
  }, [id, isAuthenticated, user?.role]);

  const toggleFavorite = async () => {
    if (!isAuthenticated || user?.role !== "customer") {
      navigate("/login");
      return;
    }

    const nextValue = !isFavorited;
    setFavoriteLoading(true);
    setError("");
    setFavoriteSuccess("");
    setIsFavorited(nextValue);

    try {
      if (nextValue) {
        await addFavorite(id);
        setFavoriteSuccess("Vendor added to favorites");
      } else {
        await removeFavorite(id);
        setFavoriteSuccess("Vendor removed from favorites");
      }
    } catch (requestError) {
      setIsFavorited(!nextValue);
      setError(getApiError(requestError, "Unable to update favorites."));
    } finally {
      setFavoriteLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="section-pad container-shell">
        <LoadingSkeleton />
      </section>
    );
  }

  if (error || !vendor) {
    return (
      <section className="section-pad container-shell">
        <EmptyState
          title="Vendor unavailable"
          description={error || "This vendor profile could not be found."}
        />
      </section>
    );
  }

  const gallery = getVendorGallery(vendor);

  return (
    <>
      <Toast
        message={error || favoriteSuccess}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setFavoriteSuccess("");
        }}
      />
      <section className="container-shell py-5">
        <Button to="/vendors" variant="ghost" className="!px-0">
          <ChevronLeft className="h-4 w-4" /> Back to vendors
        </Button>
        <div className="mt-3 grid h-[430px] grid-cols-2 gap-3 overflow-hidden rounded-[2rem] bg-sand sm:grid-cols-4">
          <img
            src={gallery[0]}
            alt={vendor.businessName}
            className="col-span-2 h-full w-full object-cover sm:row-span-2"
          />
          {gallery.slice(1, 5).map((image) => (
            <img
              key={image}
              src={image}
              alt=""
              className="hidden h-full w-full object-cover sm:block"
            />
          ))}
        </div>
      </section>
      <section className="container-shell grid items-start gap-10 pb-20 pt-5 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">
                {vendor.serviceCategory}
              </p>
              <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold sm:text-5xl">
                {vendor.businessName}
                {vendor.verified && (
                  <BadgeCheck className="h-6 w-6 fill-coral text-white" />
                )}
              </h1>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink/55">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <strong className="text-ink">
                    {vendor.averageRating || vendor.rating || "New"}
                  </strong>
                  ({vendor.reviewCount ?? vendor.reviewsCount ?? 0} reviews)
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {vendor.location}
                </span>
                <span className="flex items-center gap-1">
                  <Clock3 className="h-4 w-4" /> {vendor.experience} years
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={favoriteLoading}
                className={`grid h-11 w-11 place-items-center rounded-full border bg-white transition hover:border-coral/40 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isFavorited ? "text-coral" : "text-ink"
                }`}
                onClick={toggleFavorite}
                aria-label={
                  isFavorited ? "Remove from favorites" : "Save vendor"
                }
              >
                <Heart
                  className={`h-4 w-4 ${
                    isFavorited ? "fill-current" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full border bg-white"
                onClick={() =>
                  navigator.clipboard?.writeText(window.location.href)
                }
                aria-label="Copy vendor link"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="my-9 border-t" />
          <h2 className="text-2xl font-extrabold">
            About {vendor.businessName}
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-ink/55">
            {vendor.description}
          </p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {[
              vendor.verified ? "Verified by PLANZO" : "PLANZO vendor",
              "Personalized proposals",
              "Transparent package pricing",
              "Direct booking requests",
            ].map((item) => (
              <p
                key={item}
                className="flex items-center gap-3 rounded-2xl bg-sage/10 p-4 text-sm font-semibold"
              >
                <Check className="h-4 w-4 text-sage" />
                {item}
              </p>
            ))}
          </div>
          <div className="my-9 border-t" />
          <h2 className="text-2xl font-extrabold">Portfolio highlights</h2>
          <div className="mt-5 grid grid-cols-2 gap-4">
            {gallery.map((image, index) => (
              <img
                key={image}
                src={image}
                alt={`Portfolio ${index + 1}`}
                className={`h-56 w-full rounded-2xl object-cover ${
                  index === 0 ? "col-span-2 sm:h-80" : ""
                }`}
              />
            ))}
          </div>
          <div className="my-9 border-t" />
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
                Verified experiences
              </p>
              <h2 className="mt-2 text-2xl font-extrabold">
                Customer reviews
              </h2>
            </div>
            <p className="text-sm font-bold text-ink/50">
              {vendor.reviewCount ?? vendor.reviewsCount ?? 0} total
            </p>
          </div>
          <div className="mt-6">
            {reviewsError ? (
              <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-600">
                {reviewsError}
              </p>
            ) : (
              <ReviewList reviews={reviews} loading={reviewsLoading} />
            )}
          </div>
        </div>
        <aside className="sticky top-28 rounded-[2rem] border bg-white p-6 shadow-lift">
          <p className="text-xs text-ink/45">Packages starting from</p>
          <p className="mt-1 text-2xl font-extrabold">
            {formatCurrency(vendor.pricing)}
          </p>
          <div className="my-6 border-t" />
          <div className="space-y-4 text-sm">
            <p className="flex items-center justify-between">
              <span className="text-ink/45">Experience</span>
              <strong>{vendor.experience} years</strong>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-ink/45">Location</span>
              <strong>{vendor.location}</strong>
            </p>
          </div>
          <Button to={`/booking/${vendor._id}`} className="mt-7 w-full">
            <CalendarDays className="h-4 w-4" /> Request to book
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={favoriteLoading}
            onClick={toggleFavorite}
            className="mt-3 w-full"
          >
            <Heart className={`h-4 w-4 ${isFavorited ? "fill-current" : ""}`} />
            {isFavorited ? "Saved vendor" : "Save vendor"}
          </Button>
          <p className="mt-4 text-center text-xs text-ink/40">
            No payment required to send a request
          </p>
        </aside>
      </section>
    </>
  );
}
