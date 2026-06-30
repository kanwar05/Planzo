import { CalendarDays, CheckCircle2, ChevronLeft, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendorAvailability } from "../services/availabilityService";
import { createBooking } from "../services/bookingService";
import { getVendorById } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

export default function BookingRequestPage() {
  useDocumentTitle("Booking request");
  const { vendorId } = useParams();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getVendorById(vendorId)
      .then(setVendor)
      .catch((requestError) =>
        setError(getApiError(requestError, "Unable to load this vendor.")),
      )
      .finally(() => setLoading(false));
  }, [vendorId]);

  useEffect(() => {
    if (!vendor?._id || !selectedDate) return;

    setAvailabilityLoading(true);
    setSelectedSlot(null);
    getVendorAvailability(vendor._id, { date: selectedDate })
      .then((response) => setSlots(response.availableSlots || []))
      .catch((requestError) =>
        setError(
          getApiError(requestError, "Unable to load vendor availability."),
        ),
      )
      .finally(() => setAvailabilityLoading(false));
  }, [vendor?._id, selectedDate]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    if (!selectedSlot) {
      setError("Choose an available time slot before submitting.");
      setSubmitting(false);
      return;
    }

    try {
      await createBooking({
        vendorId,
        eventType: form.get("eventType"),
        eventDate: selectedDate,
        eventStartTime: selectedSlot.startTime,
        eventEndTime: selectedSlot.endTime,
        eventLocation: form.get("eventLocation"),
        budget: Number(form.get("budget")),
        specialRequirements: form.get("specialRequirements"),
      });
      setSent(true);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to submit this booking."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="container-shell py-20 text-center text-ink/45">
        Loading vendor…
      </section>
    );
  }

  if (!vendor) {
    return (
      <section className="section-pad container-shell">
        <EmptyState title="Vendor unavailable" description={error} />
      </section>
    );
  }

  if (sent) {
    return (
      <section className="container-shell grid min-h-[70vh] place-items-center py-20">
        <div className="max-w-md text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sage/15 text-sage">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="mt-6 text-4xl font-extrabold">Request sent!</h1>
          <p className="mt-4 leading-7 text-ink/50">
            {vendor.businessName} can now review your event details.
          </p>
          <Button to="/customer/dashboard" className="mt-7">
            View my bookings
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="container-shell py-12 sm:py-16">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <Button
        to={`/vendors/${vendor._id}`}
        variant="ghost"
        className="!px-0"
      >
        <ChevronLeft className="h-4 w-4" /> Vendor profile
      </Button>
      <div className="mx-auto mt-5 grid max-w-5xl gap-8 lg:grid-cols-[1fr_330px]">
        <div className="rounded-[2rem] border bg-white p-6 shadow-soft sm:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">
            Almost there
          </p>
          <h1 className="mt-3 text-3xl font-extrabold">
            Tell us about your event.
          </h1>
          <p className="mt-2 text-sm text-ink/50">
            A little detail helps {vendor.businessName} create a more accurate
            proposal.
          </p>
          <form onSubmit={submit} className="mt-8 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label">Event type</label>
              <select required name="eventType" className="field">
                <option value="">Select event</option>
                <option>Wedding</option>
                <option>Birthday</option>
                <option>Corporate Event</option>
                <option>Anniversary</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="label">Event date</label>
              <input
                required
                name="eventDate"
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="field"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Available time slots</label>
              {availabilityLoading ? (
                <div className="rounded-2xl border bg-sand/60 p-4 text-sm font-semibold text-ink/45">
                  Loading slots...
                </div>
              ) : slots.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {slots.map((slot) => {
                    const isSelected =
                      selectedSlot?.startTime === slot.startTime &&
                      selectedSlot?.endTime === slot.endTime;

                    return (
                      <button
                        type="button"
                        key={`${slot.startTime}-${slot.endTime}`}
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot)}
                        className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold transition ${
                          isSelected
                            ? "border-coral bg-coral text-white"
                            : slot.available
                              ? "bg-white text-ink hover:border-coral/50 hover:text-coral"
                              : "cursor-not-allowed bg-ink/5 text-ink/30"
                        }`}
                        title={slot.reason || "Available"}
                      >
                        <Clock3 className="h-4 w-4" />
                        {slot.startTime} - {slot.endTime}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border bg-red-50 p-4 text-sm font-semibold text-red-600">
                  No available slots on this date. Choose another date.
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="label">Event location</label>
              <input
                required
                name="eventLocation"
                className="field"
                placeholder="Venue, area, or city"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Estimated budget</label>
              <input
                required
                name="budget"
                type="number"
                min="0"
                className="field"
                placeholder="₹ 100,000"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Special requirements</label>
              <textarea
                name="specialRequirements"
                className="field min-h-32 resize-none"
                placeholder="Guest count, preferred style, timings, or anything else..."
              />
            </div>
            <Button
              type="submit"
              loading={submitting}
              disabled={submitting || !selectedSlot}
              className="sm:col-span-2"
            >
              <CalendarDays className="h-4 w-4" /> Submit booking request
            </Button>
          </form>
        </div>
        <aside className="h-fit rounded-[2rem] bg-ink p-5 text-white">
          <img
            src={getVendorImage(vendor)}
            alt={vendor.businessName}
            className="h-44 w-full rounded-2xl object-cover"
          />
          <p className="mt-5 text-xs font-bold uppercase tracking-wider text-coral">
            {vendor.serviceCategory}
          </p>
          <h2 className="mt-1 text-xl font-extrabold">{vendor.businessName}</h2>
          <p className="mt-2 text-sm text-white/50">
            {vendor.location} ·{" "}
            {vendor.averageRating || vendor.rating || "New"} ★
          </p>
          <div className="my-5 border-t border-white/10" />
          <p className="text-xs text-white/40">Starting package</p>
          <p className="mt-1 font-bold">{formatCurrency(vendor.pricing)}</p>
        </aside>
      </div>
    </section>
  );
}
