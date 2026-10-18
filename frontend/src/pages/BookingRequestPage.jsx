import { CheckCircle2, ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendorAvailability } from "../services/availabilityService";
import { createBooking } from "../services/bookingService";
import { getVendorById } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";
import { getVendorImage } from "../utils/vendor";
import { todayDate } from "../utils/format";
export default function BookingRequestPage() {
  useDocumentTitle("Request booking");
  const {
    vendorId
  } = useParams();
  const [vendor, setVendor] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([getVendorById(vendorId), getVendorAvailability(vendorId)]).then(([profile, data]) => {
      if (active) {
        setVendor(profile);
        setAvailability(data.availability);
      }
    }).catch(err => {
      if (active) setError(getApiError(err, "Unable to load booking details."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [vendorId]);
  const blocked = [...(availability?.unavailableDates || []), ...(availability?.bookedDates || [])].includes(date);
  const submit = async event => {
    event.preventDefault();
    setError("");
    if (blocked) {
      setError("This date is unavailable. Please choose another date.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await createBooking({
        vendorId,
        eventDate: date,
        eventLocation: form.get("eventLocation"),
        eventType: form.get("eventType"),
        description: form.get("description"),
        notes: form.get("notes")
      });
      setSent(true);
    } catch (err) {
      setError(getApiError(err, "Unable to send booking request."));
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) return <section className="container-shell py-16">
    <LoadingSkeleton />
  </section>;
  if (!vendor || !availability) return <section className="container-shell py-16">
    <EmptyState title="Booking unavailable" description={error || "Please try again later."} actionTo="/vendors" actionLabel="Browse vendors" />
  </section>;
  if (sent) return <section className="container-shell grid min-h-[70vh] place-items-center py-20">
    <div className="max-w-md text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-sage" />
      <h1 className="mt-6 text-4xl font-extrabold">Request sent!</h1>
      <p className="mt-4 leading-7 text-ink/55">{vendor.businessName} will review your request. Track the status in your dashboard.</p>
      <Button to="/customer/dashboard" className="mt-7">View my bookings</Button>
    </div>
  </section>;
  return <section className="container-shell py-12">
    <Button to={`/vendors/${vendorId}`} variant="ghost" className="!px-0"><ChevronLeft className="h-4 w-4" />Vendor profile</Button>
    <div className="mx-auto mt-5 grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[2rem] border bg-white p-6 shadow-soft sm:p-9">
        <p className="text-xs font-extrabold uppercase tracking-wider text-coral">Plan your celebration</p>
        <h1 className="mt-3 text-3xl font-extrabold">Request a booking.</h1>
        <p className="mt-3 text-sm leading-6 text-ink/55">Share your plans. Your vendor will accept or reject the request.</p>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>}
        <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block">
            <span className="label">Event date</span>
            <input required type="date" min={todayDate()} value={date} onChange={event => setDate(event.target.value)} className="field" />
            {blocked && <span role="alert" className="mt-2 block text-sm text-red-700">This date is unavailable or already booked.</span>}
          </label>
          <label className="block">
            <span className="label">Event type</span>
            <input required name="eventType" maxLength={100} className="field" placeholder="Wedding, birthday, corporate event…" />
          </label>
          <label className="block">
            <span className="label">Event location</span>
            <input required name="eventLocation" maxLength={250} className="field" placeholder="Venue and city" />
          </label>
          <label className="block">
            <span className="label">Event description</span>
            <textarea required name="description" minLength={10} maxLength={2000} rows={4} className="field" placeholder="Tell the vendor about your event and the services you need." />
          </label>
          <label className="block">
            <span className="label">Customer notes (optional)</span>
            <textarea name="notes" maxLength={1000} rows={3} className="field" placeholder="Anything else the vendor should know" />
          </label>
          <Button type="submit" loading={submitting} disabled={submitting || blocked} className="w-full">Send booking request</Button>
        </form>
      </div>
      <aside className="h-fit overflow-hidden rounded-[2rem] border bg-white shadow-soft">
        <img src={getVendorImage(vendor)} alt={vendor.businessName} className="h-52 w-full object-cover" />
        <div className="p-6">
          <p className="text-xs font-bold uppercase text-coral">
            {vendor.serviceCategory}
          </p>
          <h2 className="mt-2 text-xl font-extrabold">
            {vendor.businessName}
          </h2>
          <p className="mt-2 text-sm text-ink/50">
            {vendor.location}
          </p>
          <p className="mt-5 text-sm">Starting at <strong>
              {formatCurrency(vendor.pricing || 0)}
            </strong></p>
          <p className="mt-4 text-xs leading-6 text-ink/50">The starting price is for reference. Confirm the final service details directly with the vendor after acceptance.</p>
        </div>
      </aside>
    </div>
  </section>;
}
