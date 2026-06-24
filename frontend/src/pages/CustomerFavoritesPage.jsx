import { ArrowUpRight, Heart, MapPin, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  getFavorites,
  removeFavorite,
} from "../services/favoriteService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

export default function CustomerFavoritesPage() {
  useDocumentTitle("Saved vendors");
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getFavorites()
      .then(setFavorites)
      .catch((requestError) =>
        setError(getApiError(requestError, "Unable to load saved vendors.")),
      )
      .finally(() => setLoading(false));
  }, []);

  const removeSavedVendor = async (vendorId) => {
    const previous = favorites;
    setRemovingId(vendorId);
    setError("");
    setSuccess("");
    setFavorites((current) =>
      current.filter((item) => item.vendorId?._id !== vendorId),
    );

    try {
      await removeFavorite(vendorId);
      setSuccess("Vendor removed from favorites");
    } catch (requestError) {
      setFavorites(previous);
      setError(getApiError(requestError, "Unable to remove this vendor."));
    } finally {
      setRemovingId("");
    }
  };

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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold text-coral">Your shortlist</p>
          <h1 className="mt-1 text-3xl font-extrabold">Saved vendors</h1>
          <p className="mt-2 text-sm text-ink/45">
            Keep your favorite event pros in one easy-to-revisit place.
          </p>
        </div>
        <Button to="/vendors">Find more vendors</Button>
      </div>

      <div className="mt-8">
        {loading ? (
          <LoadingSkeleton />
        ) : favorites.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {favorites.map((favorite) => {
              const vendor = favorite.vendorId;
              const rating = vendor.averageRating || vendor.rating || "New";
              const reviewCount = vendor.reviewCount ?? vendor.reviewsCount ?? 0;

              return (
                <Card key={favorite._id} className="overflow-hidden">
                  <div className="relative h-56 overflow-hidden">
                    <img
                      src={getVendorImage(vendor)}
                      alt={vendor.businessName}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-coral shadow-md backdrop-blur">
                      <Heart className="h-4 w-4 fill-current" />
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-coral">
                          {vendor.serviceCategory || vendor.category}
                        </p>
                        <h2 className="mt-1 text-lg font-extrabold">
                          {vendor.businessName}
                        </h2>
                      </div>
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {rating}
                      </span>
                    </div>
                    <p className="mt-4 flex items-center gap-1.5 text-sm text-ink/50">
                      <MapPin className="h-4 w-4" />
                      {vendor.location}
                      {reviewCount > 0 && (
                        <>
                          <span className="mx-1">·</span>
                          {reviewCount} reviews
                        </>
                      )}
                    </p>
                    <div className="mt-5 border-t border-ink/8 pt-4">
                      <p className="text-[11px] text-ink/40">
                        Packages from
                      </p>
                      <p className="text-sm font-bold">
                        {formatCurrency(vendor.pricing ?? vendor.startingPrice)}
                      </p>
                    </div>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                      <Button
                        to={`/vendors/${vendor._id}`}
                        variant="ghost"
                        className="flex-1 !px-3"
                      >
                        View profile <ArrowUpRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        loading={removingId === vendor._id}
                        onClick={() => removeSavedVendor(vendor._id)}
                        className="flex-1 !px-3"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No saved vendors yet"
            description="Tap the heart on vendors you like and they’ll appear here."
            actionLabel="Browse vendors"
            actionTo="/vendors"
          />
        )}
      </div>
    </div>
  );
}
