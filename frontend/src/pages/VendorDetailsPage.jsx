import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Images, MapPin, Plus, X } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useModalFocus } from "../hooks/useModalFocus";
import { getVendorById } from "../services/vendorService";
import { getVendorAvailability } from "../services/availabilityService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate, todayDate } from "../utils/format";
import { getVendorGallery, getVendorImage } from "../utils/vendor";

export default function VendorDetailsPage() {
  const { id } = useParams();
  const [vendor, setVendor] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState(null);
  const [railIndex, setRailIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const touchStart = useRef(null);
  const reduceMotion = useReducedMotion();
  const previewOpen = previewIndex !== null;
  const galleryRef = useModalFocus(previewOpen, () => setPreviewIndex(null));
  const gallery = vendor ? getVendorGallery(vendor) : [];
  useDocumentTitle(vendor?.businessName || "Vendor profile");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setVendor(null);
    setError("");
    setAvailability(null);
    setAvailabilityError("");
    setPreviewIndex(null);
    setRailIndex(0);
    getVendorById(id).then(data => { if (active) setVendor(data); })
      .catch(err => { if (active) setError(getApiError(err)); })
      .finally(() => { if (active) setLoading(false); });
    getVendorAvailability(id).then(data => { if (active) setAvailability(data.availability); })
      .catch(() => { if (active) setAvailabilityError("Availability could not be loaded. Please check before submitting your request."); });
    return () => { active = false; };
  }, [id, retry]);

  useEffect(() => {
    if (!previewOpen || gallery.length < 2) return undefined;
    const navigate = event => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        setPreviewIndex(index => (index + (event.key === "ArrowRight" ? 1 : -1) + gallery.length) % gallery.length);
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [previewOpen, gallery.length]);

  if (loading) return <section className="container-shell py-12" aria-label="Loading vendor profile" aria-busy="true"><LoadingSkeleton /></section>;
  if (error || !vendor) return <section className="container-shell py-12"><EmptyState title="Vendor unavailable" description={error || "This profile could not be found."} actionTo="/vendors" actionLabel="Browse vendors" />{error && <div className="mt-4 text-center"><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>}</section>;

  const approved = vendor.verificationStatus === "approved" || (!vendor.verificationStatus && vendor.verified);
  const hasPrice = vendor.pricing !== undefined && vendor.pricing !== null;
  const price = hasPrice ? formatCurrency(vendor.pricing) : "On request";
  const unavailableDates = [...new Set([...(availability?.unavailableDates || []), ...(availability?.bookedDates || [])])].filter(date => date >= todayDate()).sort();
  const nextPhoto = direction => setPreviewIndex(index => (index + direction + gallery.length) % gallery.length);

  return <div className="bg-cream pb-28 lg:pb-0">
    <div className="container-shell pt-5 sm:pt-7">
      <div className="mb-5 flex items-center justify-between gap-3"><Button to="/vendors" variant="ghost" className="!min-h-11 !px-0 !text-xs"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to explore</Button><p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-ink/65">The Planzo collection</p></div>

      <div className="relative -mx-5 sm:mx-0">
        {gallery.length ? <>
          <div aria-label="Vendor portfolio photos" className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth motion-reduce:scroll-auto lg:grid lg:h-[400px] lg:grid-cols-4 lg:grid-rows-2 lg:gap-3 lg:overflow-hidden lg:rounded-[1.75rem]" onScroll={event => { const { scrollLeft, clientWidth } = event.currentTarget; if (clientWidth) setRailIndex(Math.round(scrollLeft / clientWidth)); }}>
            {gallery.map((src, index) => <button key={src} type="button" aria-label={`Preview business photo ${index + 1}`} onClick={() => setPreviewIndex(index)} className={`relative h-[300px] w-full shrink-0 snap-center overflow-hidden bg-sand focus-visible:outline-offset-[-4px] sm:h-[400px] lg:h-full lg:min-h-0 ${index === 0 ? "lg:col-span-2 lg:row-span-2" : ""} ${index > 4 ? "lg:hidden" : ""} ${gallery.length === 1 ? "lg:!col-span-4" : gallery.length === 2 && index === 1 ? "lg:col-span-2 lg:row-span-2" : gallery.length === 3 && index > 0 || gallery.length === 4 && index === 3 ? "lg:col-span-2" : ""}`}><img src={src} alt={`${vendor.businessName} portfolio, photo ${index + 1}`} width="1200" height="800" loading={index === 0 ? "eager" : "lazy"} fetchpriority={index === 0 ? "high" : "auto"} className="h-full w-full object-cover transition-transform duration-500 motion-reduce:transition-none hover:scale-[1.03] motion-reduce:hover:scale-100" /></button>)}
          </div>
          <button type="button" onClick={() => setPreviewIndex(Math.min(railIndex, gallery.length - 1))} className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/95 px-4 text-[11px] font-bold shadow-sm"><Images className="h-4 w-4" aria-hidden="true" /><span className="lg:hidden">{Math.min(railIndex + 1, gallery.length)} / {gallery.length} photos</span><span className="hidden lg:inline">View all {gallery.length} photos</span></button>
        </> : <div className="relative overflow-hidden bg-sand sm:rounded-[1.75rem]"><img src={getVendorImage(vendor)} alt={`${vendor.serviceCategory} inspiration`} width="1200" height="600" fetchpriority="high" className="h-[280px] w-full object-cover sm:h-[400px]" /><span className="absolute bottom-4 right-4 rounded-full bg-white/95 px-3 py-2 text-[10px] font-semibold">Category inspiration</span></div>}
      </div>

      <div className="grid gap-8 pb-12 pt-7 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 lg:pb-20">
        <div className="min-w-0">
          <header className="border-b border-ink/10 pb-7 sm:pb-9">
            <div className="flex flex-wrap items-center gap-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-coral">{vendor.serviceCategory}</p>{approved && <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1.5 text-[10px] font-bold text-ink"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Verified vendor</span>}</div>
            <h1 className="mt-4 break-words font-editorial text-[2.5rem] leading-[1.1] tracking-tight sm:text-5xl">{vendor.businessName}</h1>
            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-ink/65"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{vendor.location || "Location available on request"}</span></p>
          </header>

          <section className="border-b border-ink/10 py-7 sm:py-9"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink/65">Meet your event people</p><h2 className="mt-2 font-editorial text-3xl">A little about us.</h2><p className="mt-5 whitespace-pre-line break-words text-sm leading-8 text-ink/70">{vendor.description || "This vendor hasn’t added a business introduction yet. Include your event needs in your booking request to start the conversation."}</p></section>

          <section className="border-b border-ink/10 py-7 sm:py-9"><h2 className="font-editorial text-3xl">Thoughtfully taken care of.</h2><p className="mt-2 text-xs leading-6 text-ink/65">Services offered by {vendor.businessName}.</p><ul className="mt-5 grid gap-3 sm:grid-cols-2">{(vendor.servicesOffered?.length ? vendor.servicesOffered : [vendor.serviceCategory]).map((service, index) => <li key={`${service}-${index}`} className="flex items-start gap-3 rounded-xl border border-ink/8 bg-white px-4 py-4 text-xs leading-6"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sage"><Check className="h-3 w-3" aria-hidden="true" /></span><span className="min-w-0 break-words">{service}</span></li>)}</ul></section>

          <details open className="group border-b border-ink/10 py-7 sm:py-9"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden"><h2 className="font-editorial text-3xl">Make room in the calendar.</h2><Plus className="h-4 w-4 shrink-0 transition-transform group-open:rotate-45" aria-hidden="true" /></summary><div className="mt-4"><p className="max-w-xl text-sm leading-7 text-ink/65">Dates are available unless marked unavailable or already booked. Your request is confirmed only when accepted by the vendor.</p>{availabilityError ? <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-900">{availabilityError}</p> : availability ? <><h3 className="mt-5 text-xs font-bold">Unavailable or booked dates</h3>{unavailableDates.length ? <ul className="mt-3 flex flex-wrap gap-2">{unavailableDates.map(date => <li key={date} className="rounded-lg border border-ink/10 bg-white px-3 py-2.5 text-xs text-ink/65">{formatDate(date)}</li>)}</ul> : <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sage/70 px-4 py-3 text-xs text-ink"><CalendarDays className="h-4 w-4" aria-hidden="true" />No upcoming dates are blocked.</p>}</> : <p className="mt-4 text-xs text-ink/65" role="status">Loading dates…</p>}</div></details>

          <details className="group py-7 sm:py-9"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden"><h2 className="font-editorial text-2xl">Good to know before you book.</h2><Plus className="h-4 w-4 shrink-0 transition-transform group-open:rotate-45" aria-hidden="true" /></summary><p className="mt-4 max-w-xl text-sm leading-7 text-ink/65">Share your date, guest count and the details that matter to you in a booking request. The vendor will review it before accepting. Once accepted, their contact details are available in your dashboard.</p></details>
        </div>

        <aside className="hidden lg:block"><div className="sticky top-[calc(var(--header-height)+1.5rem)] rounded-[1.5rem] border border-ink/10 bg-white p-7 shadow-soft"><p className="text-xs text-ink/65">{hasPrice ? "Your celebration, starting from" : "Pricing"}</p><p className="mt-2 break-words text-4xl font-extrabold tracking-tight">{price}</p><p className="mt-3 text-xs leading-6 text-ink/65">Share your plans. Let’s make something memorable.</p><Button to={`/booking/${vendor._id}`} className="mt-6 w-full !rounded-xl">Request booking<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button><p className="mt-4 text-center text-[10px] leading-5 text-ink/65">Your request is confirmed after vendor acceptance.</p><div className="mt-6 flex items-start gap-3 border-t border-ink/10 pt-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sage"><CalendarDays className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs font-bold">Your event. Your details.</p><p className="mt-1 text-[11px] leading-6 text-ink/65">Choose your date and tell the vendor what you have in mind.</p></div></div></div></aside>
      </div>
    </div>

    <div className="fixed inset-x-0 [--booking-nav-offset:var(--mobile-nav-offset,0px)] bottom-[var(--booking-nav-offset)] z-40 border-t border-ink/10 bg-white px-5 py-3 shadow-[0_-4px_20px_rgba(36,32,31,0.04)] md:[--booking-nav-offset:0px] lg:hidden" style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) - var(--booking-nav-offset)))" }}><div className="mx-auto flex max-w-2xl items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] text-ink/65">{hasPrice ? "Starting from" : "Pricing"}</p><p className="truncate text-lg font-extrabold tracking-tight">{price}</p></div><Button to={`/booking/${vendor._id}`} className="!rounded-xl !px-5 !text-xs">Request booking<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></div></div>

    <AnimatePresence>{previewOpen && gallery[previewIndex] && <motion.div ref={galleryRef} role="dialog" aria-modal="true" aria-labelledby="gallery-title" tabIndex={-1} className="fixed inset-0 z-[110] flex flex-col bg-[#171514] p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white sm:p-7 sm:pt-[max(1.75rem,env(safe-area-inset-top))]" initial={{ opacity: 0.96 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} onTouchStart={event => { touchStart.current = event.touches.length === 1 ? event.touches[0].clientX : null; }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={event => { if (touchStart.current !== null && gallery.length > 1) { const difference = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(difference) > 50) nextPhoto(difference < 0 ? 1 : -1); } touchStart.current = null; }}>
      <div className="flex items-center justify-between gap-4"><div className="min-w-0"><h2 id="gallery-title" className="break-words text-sm font-semibold">{vendor.businessName}</h2><p className="mt-1 text-[11px] text-white/60" aria-live="polite">Photo {previewIndex + 1} of {gallery.length}</p></div><button type="button" aria-label="Close photo preview" onClick={() => setPreviewIndex(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10"><X className="h-5 w-5" aria-hidden="true" /></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-5" onClick={event => { if (event.target === event.currentTarget) setPreviewIndex(null); }}><img src={gallery[previewIndex]} alt={`${vendor.businessName} portfolio, photo ${previewIndex + 1} enlarged`} className="max-h-full max-w-full rounded-lg object-contain" /></div>
      <div className="flex shrink-0 items-center justify-between gap-3 pb-[env(safe-area-inset-bottom)]"><button type="button" aria-label="Previous photo" disabled={gallery.length < 2} onClick={() => nextPhoto(-1)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-xs disabled:opacity-30"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button><p className="hidden text-[11px] text-white/60 sm:block">Use arrow keys to explore · Esc to close</p><button type="button" aria-label="Next photo" disabled={gallery.length < 2} onClick={() => nextPhoto(1)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-xs disabled:opacity-30">Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button></div>
    </motion.div>}</AnimatePresence>
  </div>;
}
