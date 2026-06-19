import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import VendorCard from "../components/VendorCard";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendors } from "../services/vendorService";
import { getApiError } from "../utils/apiError";

export default function VendorsPage() {
  useDocumentTitle("Find vendors");
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [location, setLocation] = useState("");
  const [rating, setRating] = useState("");
  const [sort, setSort] = useState("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const data = await getVendors({
          search: search || undefined,
          category: category || undefined,
          location: location || undefined,
          limit: 50,
          sort:
            sort === "price_asc" || sort === "price_desc" ? sort : undefined,
        });
        setVendors(data.vendors);
      } catch (requestError) {
        setError(getApiError(requestError, "Unable to load vendors."));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, category, location, sort]);

  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (category) next.category = category;
    setParams(next, { replace: true });
  }, [search, category, setParams]);

  const filtered = useMemo(() => {
    const result = vendors.filter(
      (vendor) => !rating || vendor.rating >= Number(rating),
    );

    if (sort === "rating") {
      return [...result].sort((a, b) => b.rating - a.rating);
    }
    if (sort === "experience") {
      return [...result].sort((a, b) => b.experience - a.experience);
    }
    return result;
  }, [vendors, rating, sort]);

  const locations = useMemo(
    () => [...new Set(vendors.map((vendor) => vendor.location))].sort(),
    [vendors],
  );

  const clear = () => {
    setSearch("");
    setCategory("");
    setLocation("");
    setRating("");
    setSort("recommended");
    setParams({});
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
        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="field"
        >
          <option value="">All locations</option>
          {locations.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Minimum rating</label>
        <div className="grid grid-cols-2 gap-2">
          {["4", "4.5", "4.8"].map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setRating(rating === item ? "" : item)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                rating === item
                  ? "border-coral bg-coral/10 text-coral"
                  : "bg-white"
              }`}
            >
              {item}+ ★
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <section className="section-pad container-shell !pt-12">
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
              <strong className="text-ink">{filtered.length}</strong> trusted
              vendors
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
          ) : filtered.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((vendor) => (
                <VendorCard key={vendor._id} vendor={vendor} />
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
