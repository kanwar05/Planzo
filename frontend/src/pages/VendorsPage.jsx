import { Search } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const query = params.toString();
  const page = Math.max(1, Number(params.get("page")) || 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const filters = Object.fromEntries(["search", "category", "city", "minPrice", "maxPrice"].map(key => [key, params.get(key) || undefined]));
    getVendors({
      ...filters,
      page,
      limit: 12
    }, {
      signal: controller.signal
    }).then(data => {
      setVendors(data.vendors || []);
      setPagination(data.pagination || {});
    }).catch(err => {
      if (!controller.signal.aborted) setError(getApiError(err, "Unable to load vendors."));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [query, reload]);
  const submit = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const min = form.get("minPrice"),
      max = form.get("maxPrice");
    if (min && max && Number(min) > Number(max)) {
      setError("Minimum price must not exceed maximum price.");
      return;
    }
    const next = {};
    for (const [key, value] of form) if (String(value).trim()) next[key] = String(value).trim();
    setError("");
    setParams(next);
    setReload(value => value + 1);
  };
  const reset = () => {
    setError("");
    setParams({});
    setReload(value => value + 1);
  };
  const changePage = next => {
    const updated = new URLSearchParams(params);
    updated.set("page", String(next));
    setParams(updated);
  };
  const pages = pagination.pages || pagination.totalPages || 1;
  const hasNext = pagination.hasNextPage ?? page < pages;
  return <section className="section-pad container-shell !pt-12">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">The Planzo marketplace</p>
    <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">Find your event people.</h1>
    <p className="mt-4 text-ink/55">Explore approved vendors for your next celebration.</p>
    <form key={query} onSubmit={submit} className="mt-8 grid gap-4 rounded-[1.75rem] border bg-white p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
      <label>
        <span className="label">Vendor or service</span>
        <input name="search" defaultValue={params.get("search") || ""} className="field" placeholder="Name or service" maxLength={120} />
      </label>
      <label>
        <span className="label">Category</span>
        <select name="category" defaultValue={params.get("category") || ""} className="field">
          <option value="">All categories</option>
          {services.map(item => <option key={item.slug}>
            {item.title}
          </option>)}
        </select>
      </label>
      <label>
        <span className="label">City</span>
        <input name="city" defaultValue={params.get("city") || ""} className="field" placeholder="Your city" maxLength={100} />
      </label>
      <label>
        <span className="label">Minimum price (INR)</span>
        <input name="minPrice" type="number" min="0" defaultValue={params.get("minPrice") || ""} className="field" placeholder="Any" />
      </label>
      <label>
        <span className="label">Maximum price (INR)</span>
        <input name="maxPrice" type="number" min="0" defaultValue={params.get("maxPrice") || ""} className="field" placeholder="Any" />
      </label>
      <div className="flex items-end gap-3">
        <Button type="submit"><Search className="h-4 w-4" />Search</Button>
        <Button type="button" variant="outline" onClick={reset}>Reset</Button>
      </div>
    </form>
    <div aria-live="polite" className="mt-8">
      {error && <p role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>}
      {loading ? <LoadingSkeleton /> : error ? <EmptyState title="Search unavailable" description="Please try your search again." onClear={reset} actionLabel="Reset search" /> : vendors.length ? <>
        <p className="mb-5 text-sm text-ink/55">{pagination.total ?? vendors.length} vendors found</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map(vendor => <VendorCard key={vendor._id} vendor={vendor} />)}
        </div>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</Button>
          <span className="text-sm">Page {page}</span>
          <Button variant="outline" disabled={!hasNext} onClick={() => changePage(page + 1)}>Next</Button>
        </div>
      </> : <EmptyState onClear={reset} />}
    </div>
  </section>;
}
