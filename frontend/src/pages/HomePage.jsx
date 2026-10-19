import { ArrowDown, ArrowRight, ArrowUpRight, CalendarCheck2, Check, ChevronRight, Compass, MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";
import * as motion from "motion/react-m";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import SectionHeading from "../components/SectionHeading";
import VendorCard from "../components/VendorCard";
import { services } from "../data/services";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getApiError } from "../utils/apiError";
import weddingImage from "../assets/optimized/luxury_wedding_editorial_1788675454322.webp";
import tablescapeImage from "../assets/optimized/tablescape_details_macro_1788675492844-small.webp";
import partnerImage from "../assets/optimized/indian_woman_event_producer.webp";

const steps = [
  { icon: Compass, title: "Find your people", text: "Explore event professionals by service, city, and budget. Find a style that feels like you." },
  { icon: CalendarCheck2, title: "Make the first move", text: "Choose your date and share a few event details. Send your booking request in a few simple steps." },
  { icon: Sparkles, title: "Bring it all together", text: "Follow your request in your dashboard. Once accepted, connect using the vendor’s shared business details." },
];
export default function HomePage() {
  useDocumentTitle("Every celebration starts here");
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    import("../services/vendorService")
      .then(({ getVendors }) => controller.signal.aborted ? null : getVendors({ limit: 6 }, { signal: controller.signal }))
      .then(data => { if (!controller.signal.aborted) setVendors(data.vendors || []); })
      .catch(err => { if (!controller.signal.aborted) setError(getApiError(err, "We couldn’t load vendors right now.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const search = event => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    if (city.trim()) params.set("city", city.trim());
    navigate(`/vendors${params.size ? `?${params}` : ""}`);
  };
  const cities = [...new Set(vendors.map(v => v.location).filter(Boolean))].slice(0, 5);
  return <>
    <section className="container-shell relative pb-6 pt-6 sm:pt-12 lg:pb-16 lg:pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="relative z-10 pb-1 lg:py-8">
          <div className="hero-copy">
            <p className="eyebrow flex items-center gap-2.5"><span className="h-px w-6 bg-coral" />Big days. Beautiful beginnings.</p>
            <h1 className="mt-5 max-w-xl font-editorial text-[clamp(2.1rem,10.5vw,2.7rem)] font-normal leading-[1.08] tracking-[-0.035em] sm:text-6xl lg:text-[76px]">Every <span className="italic text-coral">celebration</span><br className="hidden sm:block" /> starts here.</h1>
            <p className="mt-4 max-w-sm text-[13px] leading-6 text-ink/65 sm:mt-6 sm:max-w-md sm:text-[15px] sm:leading-7">The perfect place. The right people. All the little details. Find your event team and make it a day to remember.</p>
          </div>
          <form onSubmit={search} aria-label="Find event vendors" className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-0 sm:mt-7 rounded-2xl border bg-white p-2 shadow-soft sm:grid-cols-[1.15fr_1fr_auto] lg:relative lg:w-[112%] lg:shadow-lift">
            <label className="col-span-2 flex min-w-0 items-center gap-3 px-3 py-3 sm:col-span-1"><Search aria-hidden="true" className="h-5 w-5 shrink-0 text-coral" /><span className="min-w-0 flex-1"><span className="mb-1 block text-[10px] font-bold text-ink/70">What are you planning?</span><input aria-label="Vendor or service" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} placeholder="Venues, catering, music…" className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink/65 sm:text-xs" /></span></label>
            <label className="flex min-w-0 items-center gap-3 border-t px-3 py-3 sm:border-l sm:border-t-0"><MapPin aria-hidden="true" className="h-5 w-5 shrink-0 text-coral" /><span className="min-w-0 flex-1"><span className="mb-1 block text-[10px] font-bold text-ink/70"><span className="sm:hidden">Your city</span><span className="hidden sm:inline">Where’s the celebration?</span></span><input aria-label="Event city" value={city} onChange={e => setCity(e.target.value)} maxLength={100} placeholder="Enter your city" className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink/65 sm:text-xs" /></span></label>
            <Button type="submit" className="!rounded-xl !px-4" aria-label="Explore services"><Search aria-hidden="true" className="h-4 w-4" /><span>Explore</span></Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold text-ink/65 sm:text-[11px]"><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-coral" />Approved professionals</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-coral" />Your plans, in one place</span></div>
        </div>
        <div className="relative hidden pb-7 pl-7 lg:block">
          <div className="hero-photo relative aspect-[0.94] overflow-hidden rounded-[160px_160px_24px_24px] bg-sand">
            <picture><source media="(min-width: 1024px)" srcSet={weddingImage} /><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="1024" height="1024" fetchpriority="high" alt="An intimate garden wedding surrounded by flowers and loved ones" className="h-full w-full object-cover" /></picture>
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
            <p className="absolute bottom-24 left-7 right-7 text-xs leading-6 text-white/90">For the moments you’ll look back on.<br /><span className="font-editorial text-2xl text-white">Make them yours.</span></p>
          </div>
          <div className="absolute -right-3 top-10 grid h-[92px] w-[92px] -rotate-12 place-content-center rounded-full border-[5px] border-cream bg-sage text-center"><Sparkles className="mx-auto h-5 w-5 text-[#356347]" /><p className="mt-1 text-[8px] font-bold uppercase leading-3 tracking-wider text-[#356347]">A little less planning.<br />A lot more joy.</p></div>
          <div className="absolute -left-3 bottom-0 flex items-center gap-3 rounded-2xl border border-white bg-white p-3 shadow-lift"><img src={tablescapeImage} alt="Thoughtfully styled event table" width="60" height="64" className="h-16 w-[60px] rounded-xl object-cover" /><div className="pr-3"><p className="text-[9px] font-bold uppercase tracking-wider text-ink/65">Every detail, considered</p><p className="mt-1 font-editorial text-lg">Your kind of beautiful.</p><Link to="/services" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-coral">Find your inspiration <ArrowUpRight className="h-3 w-3" /></Link></div></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="categories-heading" className="container-shell border-t pb-8 pt-7 lg:pb-10 lg:pt-8">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id="categories-heading" className="text-sm font-bold">A great celebration starts with…</h2><Link to="/services" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[11px] font-semibold text-coral">All services <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
      <div className="scroll-rail gap-3 sm:gap-5 lg:grid lg:grid-cols-8 lg:gap-4 lg:overflow-visible">
        {services.map(({ title, icon: Icon, imageSmall, label }) => <Link key={title} to={`/vendors?category=${encodeURIComponent(title)}`} className="group flex w-[98px] shrink-0 flex-col items-center gap-3 text-center lg:w-auto"><span className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-sand"><img src={imageSmall} alt="" loading="lazy" width="150" height="150" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /><span className="absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-cream/95"><Icon aria-hidden="true" className="h-3 w-3 text-coral" /></span></span><span className="text-[11px] font-semibold text-ink/75">{label || title}</span></Link>)}
      </div>
    </section>

    <section className="section-pad border-y bg-[#f3f0ea]">
      <div className="container-shell">
        <div className="flex flex-wrap items-end justify-between gap-5"><SectionHeading eyebrow="Meet your event team" title="Good people. Great celebrations." description="Explore approved professionals and find the ones who share your vision." /><Link to="/vendors" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-coral">Explore all vendors <ArrowRight className="h-4 w-4" /></Link></div>
        <div className="mt-7 sm:mt-9" aria-live="polite">{loading ? <LoadingSkeleton count={3} /> : error ? <EmptyState title="Let’s try that again" description={error} onClear={() => setReload(v => v + 1)} actionLabel="Retry loading vendors" /> : vendors.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vendors.map(vendor => <VendorCard key={vendor._id} vendor={vendor} />)}</div> : <EmptyState title="Something good is coming" description="Approved professionals will appear here as they join Planzo. Explore our services while we get things ready." actionTo="/services" actionLabel="Explore services" />}</div>
        {!!cities.length && <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-6"><span className="mr-2 text-xs text-ink/65">Find your team in</span>{cities.map(location => <Link key={location} to={`/vendors?city=${encodeURIComponent(location)}`} className="inline-flex min-h-11 items-center gap-1 rounded-full border bg-cream px-4 text-xs font-semibold"><MapPin className="h-3 w-3" />{location}<ChevronRight className="h-3 w-3" /></Link>)}</div>}
      </div>
    </section>

    <section className="section-pad container-shell">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:gap-20"><div><SectionHeading eyebrow="A little inspiration" title={<>Whatever the occasion.<br /><span className="italic text-coral">Make it a feeling.</span></>} description="From an intimate gathering to a once-in-a-lifetime celebration, start with the details that matter to you." /><Button to="/services" variant="outline" className="mt-6">Find your inspiration <ArrowUpRight className="h-4 w-4" /></Button></div><div className="grid grid-cols-2 gap-3 sm:gap-5">{[services[0], services[1]].map((item, index) => <Link to={`/vendors?category=${encodeURIComponent(item.title)}`} key={item.slug} className={`group relative overflow-hidden rounded-2xl ${index ? "mt-8" : "mb-8"}`}><img src={item.image} srcSet={`${item.imageSmall} 320w, ${item.image} 960w`} sizes="(min-width: 1024px) 340px, 50vw" alt={item.description} loading="lazy" width="450" height="560" className="aspect-[0.8] h-full w-full object-cover transition duration-300 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 sm:p-5"><div><p className="text-[9px] font-semibold uppercase tracking-widest text-white/75">{index ? "Gather around" : "Set the scene"}</p><h3 className="mt-1 font-editorial text-xl font-normal text-white sm:text-2xl">{index ? "A taste of together" : "Somewhere special"}</h3></div><ArrowUpRight className="h-5 w-5 shrink-0 text-white" /></div></Link>)}</div></div>
    </section>

    <section id="how-it-works" className="section-pad border-y bg-white"><div className="container-shell"><div className="flex flex-wrap items-end justify-between gap-5"><SectionHeading eyebrow="Less to-do. More ta-da." title="From someday to the big day." /><p className="max-w-xs text-sm leading-7 text-ink/65">A simpler way to plan, so you can be present for the moments that matter.</p></div><div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">{steps.map(({ icon: Icon, title, text }, index) => <motion.div initial={{ y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.3, delay: index * 0.05 }} key={title} className="relative border-t pt-6"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-full bg-sand text-coral"><Icon className="h-5 w-5" /></span><span className="font-editorial text-3xl text-ink/25">0{index + 1}</span></div><h3 className="mt-5 text-base font-bold">{title}</h3><p className="mt-3 text-sm leading-7 text-ink/65">{text}</p></motion.div>)}</div><div className="mt-10 flex items-start gap-3 rounded-2xl bg-sage/50 p-5 sm:items-center"><ShieldCheck className="h-6 w-6 shrink-0 text-[#356347]" /><p className="text-xs leading-6 text-[#356347]"><strong>A considered beginning.</strong> Vendor profiles are approved before they appear. Compare portfolios and starting prices, and check available dates before sending a request.</p></div></div></section>

    <section className="section-pad container-shell"><div className="grid overflow-hidden rounded-3xl bg-[#e8e5db] md:grid-cols-[1fr_0.72fr]"><div className="p-7 sm:p-10 lg:p-14"><p className="eyebrow">For the people behind the magic</p><h2 className="mt-4 max-w-md font-editorial text-3xl font-normal leading-tight sm:text-[43px]">You bring the talent.<br />We bring the <span className="italic text-coral">possibilities.</span></h2><p className="mt-4 max-w-sm text-sm leading-7 text-ink/65">Turn your craft into someone’s favourite memory. Build your business profile and connect with people planning their next celebration.</p><Button to="/register?role=vendor" variant="dark" className="mt-6">Become a partner <ArrowUpRight className="h-4 w-4" /></Button></div><img src={partnerImage} alt="An event professional preparing a beautiful celebration" loading="lazy" width="600" height="600" className="hidden h-full min-h-80 w-full object-cover md:block" /></div></section>
  </>;
}
