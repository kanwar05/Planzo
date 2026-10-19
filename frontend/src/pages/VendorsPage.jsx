import { ArrowLeft, ArrowRight, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import VendorCard from "../components/VendorCard";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useModalFocus } from "../hooks/useModalFocus";
import { getVendors } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";

const filterKeys = ["search", "category", "city", "minPrice", "maxPrice"];
const readFilters = params => Object.fromEntries(filterKeys.map(key => [key, params.get(key) || ""]));

function AdvancedFilters({ draft, setDraft, prefix }) {
  const update = event => setDraft(current => ({ ...current, [event.target.name]: event.target.value }));
  return <>
    <label htmlFor={`${prefix}-category`}><span className="label">Category</span><select id={`${prefix}-category`} name="category" value={draft.category} onChange={update} className="field"><option value="">All categories</option>{services.map(item => <option key={item.slug} value={item.title}>{item.title}</option>)}</select></label>
    <label htmlFor={`${prefix}-city`}><span className="label">City</span><input id={`${prefix}-city`} name="city" value={draft.city} onChange={update} className="field" placeholder="Enter your city" maxLength={100} /></label>
    <label htmlFor={`${prefix}-min-price`}><span className="label">Minimum price (INR)</span><input id={`${prefix}-min-price`} name="minPrice" type="number" min="0" value={draft.minPrice} onChange={update} className="field" placeholder="No minimum" /></label>
    <label htmlFor={`${prefix}-max-price`}><span className="label">Maximum price (INR)</span><input id={`${prefix}-max-price`} name="maxPrice" type="number" min="0" value={draft.maxPrice} onChange={update} className="field" placeholder="No maximum" /></label>
  </>;
}

export default function VendorsPage() {
  useDocumentTitle("Find vendors");
  const [params, setParams] = useSearchParams();
  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(() => readFilters(params));
  const reduceMotion = useReducedMotion();
  const closeFilters = () => {
    setFiltersOpen(false);
    setValidation("");
    setDraft(current => ({ ...readFilters(params), search: current.search }));
  };
  const sheetRef = useModalFocus(filtersOpen, closeFilters);
  const query = params.toString();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const activeFilters = filterKeys.filter(key => params.get(key));

  useEffect(() => { setDraft(readFilters(new URLSearchParams(query))); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const current = new URLSearchParams(query);
    const filters = Object.fromEntries(filterKeys.map(key => [key, current.get(key) || undefined]));
    getVendors({ ...filters, page, limit: 12 }, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setVendors(data.vendors || []); setPagination(data.pagination || {}); } })
      .catch(err => { if (!controller.signal.aborted) setError(getApiError(err, "Unable to load vendors.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, reload]);

  const submit = event => {
    event.preventDefault();
    if (draft.minPrice && draft.maxPrice && Number(draft.minPrice) > Number(draft.maxPrice)) {
      setValidation("Minimum price must not exceed maximum price.");
      return;
    }
    const next = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
    setValidation("");
    setParams(next);
    setFiltersOpen(false);
    // A corrected query can equal the current URL and still needs to be retried.
    setReload(value => value + 1);
  };
  const reset = () => {
    setValidation("");
    setParams({});
    setDraft(readFilters(new URLSearchParams()));
    setReload(value => value + 1);
  };
  const updateFilter = (key, value, searchText) => {
    const updated = new URLSearchParams(params);
    value ? updated.set(key, value) : updated.delete(key);
    if (typeof searchText === "string") {
      const search = searchText.trim();
      search ? updated.set("search", search) : updated.delete("search");
    }
    updated.delete("page");
    setValidation("");
    setParams(updated);
  };
  const changePage = next => {
    const updated = new URLSearchParams(params);
    updated.set("page", String(next));
    setParams(updated);
    document.getElementById("vendor-results")?.scrollIntoView?.({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };
  const chipLabel = key => ({ search: `“${params.get(key)}”`, category: params.get(key), city: params.get(key), minPrice: `From ${formatCurrency(params.get(key))}`, maxPrice: `Up to ${formatCurrency(params.get(key))}` })[key];
  const pages = pagination.pages || pagination.totalPages || 1;
  const hasNext = pagination.hasNextPage ?? page < pages;

  return <section className="container-shell pb-16 pt-8 sm:pt-12 lg:pt-16">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-coral">Good people. Great celebrations.</p><h1 className="mt-3 font-editorial text-[clamp(2rem,8.5vw,2.65rem)] leading-[1.08] tracking-tight sm:text-6xl">Find your kind<br className="sm:hidden" /> of extraordinary.</h1><p className="mt-4 max-w-lg text-sm leading-7 text-ink/65">Discover the people and places that bring your celebration to life.</p></div>
      <p className="hidden items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-xs text-ink/65 lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-coral" />Only approved vendor profiles</p>
    </div>

    <div className="sticky top-[var(--header-height)] z-30 -mx-5 mt-7 bg-cream/95 px-5 py-2 backdrop-blur-sm sm:mx-0 sm:px-0 lg:static lg:bg-transparent lg:py-0 lg:backdrop-blur-none">
      <form onSubmit={submit} className="rounded-[1.5rem] border border-ink/10 bg-white p-3 sm:p-5">
        <div className="flex min-w-0 gap-2 sm:gap-3">
          <label htmlFor="vendor-search" className="relative min-w-0 flex-1"><span className="sr-only">Vendor or service</span><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/65" aria-hidden="true" /><input id="vendor-search" name="search" type="search" value={draft.search} onChange={event => setDraft(current => ({ ...current, search: event.target.value }))} className="field !h-12 !rounded-xl !border-transparent !bg-cream !pl-10 !pr-3 sm:!text-sm" placeholder="Search vendors" maxLength={120} /></label>
          <Button type="submit" className="!rounded-xl !px-3 sm:!px-7"><Search aria-hidden="true" className="h-4 w-4 sm:hidden" /><span className="sr-only sm:not-sr-only">Search</span></Button>
          <button type="button" onClick={() => { setValidation(""); setFiltersOpen(true); }} aria-haspopup="dialog" aria-expanded={filtersOpen} aria-label={`Filters${activeFilters.length ? `, ${activeFilters.length} active` : ""}`} className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-ink/15 text-ink transition-colors hover:bg-sand lg:hidden"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{activeFilters.length > 0 && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-coral text-[9px] font-bold text-white">{activeFilters.length}</span>}</button>
        </div>
        <div className="mt-5 hidden grid-cols-4 gap-4 border-t border-ink/8 pt-4 lg:grid"><AdvancedFilters draft={draft} setDraft={setDraft} prefix="desktop" /></div>
        {validation && !filtersOpen && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{validation}</p>}
      </form>
    </div>

    <div className="-mx-5 mt-6 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0" aria-label="Browse categories"><div className="flex w-max min-w-full gap-2">
      <button type="button" aria-pressed={!params.get("category")} onClick={() => updateFilter("category", "", draft.search)} className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-xs font-bold transition-colors ${!params.get("category") ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-ink/70 hover:border-ink/30"}`}>All services</button>
      {services.map(({ title, slug, icon: Icon }) => <button key={slug} type="button" aria-pressed={params.get("category") === title} onClick={() => updateFilter("category", title, draft.search)} className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-xs font-semibold transition-colors ${params.get("category") === title ? "border-ink bg-ink text-white" : "border-ink/10 bg-white text-ink/70 hover:border-ink/30"}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{title}</button>)}
    </div></div>

    {activeFilters.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters"><AnimatePresence initial={false}>{activeFilters.map(key => <motion.button key={key} layout={!reduceMotion} transition={{ duration: reduceMotion ? 0 : 0.18 }} initial={{ opacity: 0.96 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} type="button" onClick={() => updateFilter(key, "")} aria-label={`Remove ${key === "minPrice" ? "minimum price" : key === "maxPrice" ? "maximum price" : key} filter`} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg bg-sand px-3 text-[11px] font-semibold"><span className="truncate">{chipLabel(key)}</span><X className="h-3 w-3 shrink-0" aria-hidden="true" /></motion.button>)}</AnimatePresence><button type="button" onClick={reset} className="min-h-11 px-2 text-[11px] font-bold text-coral underline underline-offset-4">Reset all</button></div>}

    <div id="vendor-results" aria-live="polite" aria-busy={loading} className="mt-8 scroll-mt-28 sm:mt-10">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-t border-ink/10 pt-7"><h2 className="min-w-0 max-w-full break-words font-editorial text-2xl sm:text-3xl">{params.get("category") || "People worth celebrating"}</h2><p className="text-xs text-ink/65">{loading ? "Finding your event people…" : error ? "Let’s try that again" : `${pagination.total ?? vendors.length} ${(pagination.total ?? vendors.length) === 1 ? "vendor" : "vendors"} found`}</p></div>
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {loading ? <LoadingSkeleton /> : error ? <EmptyState title="A little interruption" description="We couldn’t load the marketplace. Your filters are still here." onClear={() => setReload(value => value + 1)} actionLabel="Try again" /> : vendors.length ? <>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7">{vendors.map(vendor => <VendorCard key={vendor._id} vendor={vendor} />)}</div>
        {pages > 1 && <nav aria-label="Vendor result pages" className="mt-10 flex items-center justify-center gap-3 sm:gap-5"><Button variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)} className="!px-4"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Previous</Button><span className="text-xs text-ink/65">{page} / {pages}</span><Button variant="outline" disabled={!hasNext} onClick={() => changePage(page + 1)} className="!px-4">Next<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></nav>}
      </> : <EmptyState title="Your perfect match is still out there." description="Try another city, explore a different service, or make a little more room in your budget." onClear={reset} />}
    </div>

    <AnimatePresence>{filtersOpen && <motion.div key="filters" className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 sm:items-center sm:p-6" initial={{ opacity: 0.96 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} onClick={event => { if (event.target === event.currentTarget) closeFilters(); }}>
      <motion.section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="filter-title" tabIndex={-1} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[1.75rem] bg-cream p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift sm:max-w-lg sm:rounded-[1.75rem] sm:p-7" initial={{ y: reduceMotion ? 0 : 16 }} animate={{ y: 0 }} exit={{ y: reduceMotion ? 0 : 32 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden="true" /><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-coral">Make it yours</p><h2 id="filter-title" className="mt-1 font-editorial text-3xl">A little more specific.</h2></div><button type="button" aria-label="Close filters" onClick={closeFilters} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink/10"><X className="h-4 w-4" /></button></div>
        <form onSubmit={submit} className="mt-6"><div className="grid gap-5"><AdvancedFilters draft={draft} setDraft={setDraft} prefix="mobile" /></div>{validation && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{validation}</p>}<div className="mt-7 flex gap-3 border-t border-ink/10 pt-5"><Button type="button" variant="outline" onClick={reset} className="flex-1">Reset</Button><Button type="submit" className="flex-[2]">Show results<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></div></form>
      </motion.section>
    </motion.div>}</AnimatePresence>
  </section>;
}
