import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import VendorCard from "../components/VendorCard";
import { useAuth } from "../context/AuthContext";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  addFavorite,
  getFavorites,
  removeFavorite,
} from "../services/favoriteService";
import { getVendors } from "../services/vendorService";
import { getApiError } from "../utils/apiError";

export default function VendorsPage() {
  useDocumentTitle("Find vendors");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [search, setSearch] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [location, setLocation] = useState(params.get("location") || "");
  const [minRating, setMinRating] = useState(params.get("minRating") || "");
  const [minExperience, setMinExperience] = useState(params.get("minExperience") || "");
  const [minPrice, setMinPrice] = useState(params.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") || "");
  const [sort, setSort] = useState(params.get("sort") || "recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [favoriteLoadingId, setFavoriteLoadingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const data = await getVendors({
          search: search || undefined,
          category: category || undefined,
          location: location || undefined,
          minRating: minRating || undefined,
          minExperience: minExperience || undefined,
          minPrice: minPrice || undefined,
          maxPrice: maxPrice || undefined,
          sort: sort !== "recommended" ? sort : undefined,
          limit: 12,
          page: 1,
        });
        setVendors(data.vendors);
        setPagination(data.pagination);
      } catch (requestError) {
        setError(getApiError(requestError, "Unable to load vendors."));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, category, location, minRating, minExperience, minPrice, maxPrice, sort]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "customer") {
      setFavoriteIds(new Set());
      return;
    }

    getFavorites()
      .then((items) =>
        setFavoriteIds(
          new Set(items.map((item) => item.vendorId?._id).filter(Boolean)),
        ),
      )
      .catch(() => {
        setFavoriteIds(new Set());
      });
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (category) next.category = category;
    if (location) next.location = location;
    if (minRating) next.minRating = minRating;
    if (minExperience) next.minExperience = minExperience;
    if (minPrice) next.minPrice = minPrice;
    if (maxPrice) next.maxPrice = maxPrice;
    if (sort && sort !== "recommended") next.sort = sort;
    setParams(next, { replace: true });
  }, [search, category, location, minRating, minExperience, minPrice, maxPrice, sort, setParams]);

  const clear = () => {
    setSearch("");
    setCategory("");
    setLocation("");
    setMinRating("");
    setMinExperience("");
    setMinPrice("");
    setMaxPrice("");
    setSort("recommended");
    setParams({});
  };

  const toggleFavorite = async (vendorId) => {
    if (!isAuthenticated || user?.role !== "customer") {
      navigate("/login");
      return;
    }

    const wasFavorited = favoriteIds.has(vendorId);
    setFavoriteLoadingId(vendorId);
    setError("");
    setSuccess("");
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (wasFavorited) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });

    try {
      if (wasFavorited) {
        await removeFavorite(vendorId);
        setSuccess("Vendor removed from favorites");
      } else {
        await addFavorite(vendorId);
        setSuccess("Vendor added to favorites");
      }
    } catch (requestError) {
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorited) next.add(vendorId);
        else next.delete(vendorId);
        return next;
      });
      setError(getApiError(requestError, "Unable to update favorites."));
    } finally {
      setFavoriteLoadingId("");
    }
  };

  const FilterPanel = () => (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-extrabold">
          <SlidersHorizontal className="h-5 w-5" /> Filters
        </h3>
        <button onClick={clear} className="text-xs font-bold text-coral">
          Clear all
        </button>
      </div>
      <div>
        <label className="label">Service category</label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="field"
        >
          <option value="">All services</option>
          {services.map((item) => (
            <option key={item.slug} value={item.title}>
              {item.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Location</label>
        <input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="field"
          placeholder="Search location..."
        />
      </div>
      <div>
        <label className="label">Minimum rating</label>
        <div className="grid grid-cols-2 gap-2">
          {["4", "4.5", "4.8"].map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setMinRating(minRating === item ? "" : item)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                minRating === item
                  ? "border-coral bg-coral/10 text-coral"
                  : "bg-white"
              }`}
            >
              {item}+ ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Minimum experience (years)</label>
        <input
          type="number"
          min="0"
          value={minExperience}
          onChange={(event) => setMinExperience(event.target.value)}
          className="field"
          placeholder="e.g., 5"
        />
      </div>
      <div>
        <label className="label">Price range</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="field flex-1"
            placeholder="Min"
          />
          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="field flex-1"
            placeholder="Max"
          />
        </div>
      </div>
    </div>
  );

  return (
    <section className="section-pad container-shell !pt-12">
      <Toast
        message={error || success}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setSuccess("");
        }}
      />
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
          Curated for you
        </p>
        <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">
          Find your event people.
        </h1>
        <p className="mt-4 text-ink/50">
          Explore professionals whose work and pricing fit your celebration.
        </p>
      </div>
      <div className="mt-9 flex gap-3">
        <label className="relative flex-1">
          <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="field !rounded-full !py-4 !pl-13"
            style={{ paddingLeft: "3.25rem" }}
            placeholder="Search by vendor, service, or city"
          />
        </label>
        <Button
          onClick={() => setFiltersOpen(true)}
          variant="outline"
          className="lg:hidden"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
        </Button>
      </div>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="sticky top-28 hidden rounded-[1.75rem] border bg-white p-6 shadow-soft lg:block">
          <FilterPanel />
        </aside>
        <div>
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-ink/50">
              <strong className="text-ink">{vendors.length}</strong> trusted
              vendors
              {pagination.pages > 1 && (
                <span> (Page {pagination.page} of {pagination.pages})</span>
              )}
            </p>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="rounded-full border bg-white px-4 py-2.5 text-xs font-bold outline-none"
            >
              <option value="recommended">Recommended</option>
              <option value="rating">Highest rated</option>
              <option value="experience">Most experienced</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <EmptyState title="Could not load vendors" description={error} />
          ) : vendors.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {vendors.map((vendor) => (
                <VendorCard
                  key={vendor._id}
                  vendor={vendor}
                  isFavorited={favoriteIds.has(vendor._id)}
                  favoriteLoading={favoriteLoadingId === vendor._id}
                  onToggleFavorite={() => toggleFavorite(vendor._id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState onClear={clear} />
          )}
        </div>
      </div>
      {filtersOpen && (
        <div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-cream p-6">
            <div className="mb-8 flex justify-end">
              <button
                onClick={() => setFiltersOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full bg-white"
              >
                <X />
              </button>
            </div>
            <FilterPanel />
            <Button
              onClick={() => setFiltersOpen(false)}
              className="mt-9 w-full"
            >
              Show {filtered.length} vendors
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
