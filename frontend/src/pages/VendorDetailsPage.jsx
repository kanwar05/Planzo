import { CalendarDays, ChevronLeft, MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendorById } from "../services/vendorService";
import { getVendorAvailability } from "../services/availabilityService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate, todayDate } from "../utils/format";
import { getVendorGallery, getVendorImage } from "../utils/vendor";
export default function VendorDetailsPage() {
  const {
    id
  } = useParams();
  const [vendor, setVendor] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useDocumentTitle(vendor?.businessName || "Vendor profile");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setAvailability(null);
    setAvailabilityError("");
    getVendorById(id).then(data => {
      if (active) setVendor(data);
    }).catch(err => {
      if (active) setError(getApiError(err));
    }).finally(() => {
      if (active) setLoading(false);
    });
    getVendorAvailability(id).then(data => {
      if (active) setAvailability(data.availability);
    }).catch(() => {
      if (active) setAvailabilityError("Availability could not be loaded. Please check before submitting your request.");
    });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!preview) return;
    const close = event => {
      if (event.key === "Escape") setPreview("");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);
  if (loading) return <section className="container-shell py-16">
    <LoadingSkeleton />
  </section>;
  if (error || !vendor) return <section className="container-shell py-16">
    <EmptyState title="Vendor unavailable" description={error || "This profile could not be found."} actionTo="/vendors" actionLabel="Browse vendors" />
  </section>;
  const gallery = getVendorGallery(vendor);
  const unavailableDates = [...new Set([...(availability?.unavailableDates || []), ...(availability?.bookedDates || [])])].filter(date => date >= todayDate()).sort();
  return <div className="bg-[#fbf7f1]">
    <section className="border-b border-ink/8 bg-gradient-to-br from-[#fff8ef] via-white to-[#f4eadf]">
      <div className="container-shell py-6">
        <Button to="/vendors" variant="ghost" className="!px-0"><ChevronLeft className="h-4 w-4" />Back to vendors</Button>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <img src={gallery[0] || getVendorImage(vendor)} alt={vendor.businessName} className="h-64 w-full rounded-[2rem] object-cover shadow-soft sm:h-80" />
            <div className="relative -mt-10 mx-4 flex flex-col items-start gap-4 rounded-3xl bg-white p-5 shadow-soft sm:flex-row sm:items-center">
              <img src={getVendorImage(vendor)} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-coral">
                  {vendor.serviceCategory}
                </p>
                <h1 className="mt-2 text-3xl font-extrabold">
                  {vendor.businessName}
                </h1>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-ink/55">
                  <MapPin className="h-4 w-4" />
                  {vendor.location}
                </p>
              </div>
            </div>
          </div>
          <aside className="rounded-[2rem] bg-white p-6 shadow-soft">
            <p className="text-sm text-ink/50">Starting price</p>
            <p className="mt-2 text-3xl font-extrabold">
              {formatCurrency(vendor.pricing || 0)}
            </p>
            <Button to={`/booking/${vendor._id}`} className="mt-6 w-full"><CalendarDays className="h-4 w-4" />Request booking</Button>
            <p className="mt-4 text-sm leading-6 text-ink/55">The vendor will review your event details. Shared contact details become available in your dashboard after acceptance.</p>
          </aside>
        </div>
      </div>
    </section>
    <section className="container-shell grid gap-8 py-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-extrabold">About the business</h2>
          <p className="mt-4 whitespace-pre-line leading-8 text-ink/60">
            {vendor.description}
          </p>
        </section>
        <section className="rounded-[2rem] bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-extrabold">Services offered</h2>
          {vendor.servicesOffered?.length ? <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {vendor.servicesOffered.map((service, i) => <li key={i} className="rounded-2xl border border-ink/8 p-4 text-sm">
              {service}
            </li>)}
          </ul> : <p className="mt-4 text-sm text-ink/55">
            {vendor.serviceCategory}
          </p>}
        </section>
        <section className="rounded-[2rem] bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-extrabold">Business photos</h2>
          {!gallery.length && <p className="mt-4 text-sm text-ink/55">This vendor has not uploaded business photos yet.</p>}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((image, i) => <button key={image} type="button" aria-label={`Preview business photo ${i + 1}`} onClick={() => setPreview(image)}>
              <img src={image} alt={`Business photo ${i + 1}`} loading="lazy" className="h-40 w-full rounded-2xl object-cover" />
            </button>)}
          </div>
        </section>
      </div>
      <aside className="h-fit rounded-[2rem] bg-white p-6 shadow-soft">
        <h2 className="text-xl font-extrabold">Date availability</h2>
        <p className="mt-3 text-sm leading-6 text-ink/55">Dates are available unless marked unavailable or already booked. A request is confirmed only when accepted.</p>
        {availabilityError ? <p className="mt-4 text-sm text-amber-800">
          {availabilityError}
        </p> : availability ? <>
          <h3 className="mt-5 text-sm font-bold">Unavailable or booked dates</h3>
          {unavailableDates.length ? <ul className="mt-3 space-y-2 text-sm text-ink/60">
            {unavailableDates.slice(0, 20).map(date => <li key={date}>
              {formatDate(date)}
            </li>)}
          </ul> : <p className="mt-3 text-sm text-ink/55">No upcoming dates are blocked.</p>}
        </> : <p className="mt-4 text-sm text-ink/55">Loading dates…</p>}
      </aside>
    </section>
    {preview && <div role="dialog" aria-modal="true" aria-label="Business photo preview" className="fixed inset-0 z-[100] grid place-items-center bg-ink/90 p-6" onClick={() => setPreview("")}>
      <button autoFocus type="button" aria-label="Close photo preview" onClick={() => setPreview("")} className="absolute right-5 top-5 rounded-full bg-white p-3">
        <X />
      </button>
      <img src={preview} alt="Business photo enlarged" className="max-h-[85vh] max-w-full object-contain" />
    </div>}
  </div>;
}
