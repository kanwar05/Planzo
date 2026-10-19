import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendorAvailability } from "../services/availabilityService";
import { createBooking } from "../services/bookingService";
import { getVendorById } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate, todayDate } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

const steps = ["Your event", "The brief", "Review"];
const emptyDetails = { eventDate: "", eventType: "", eventLocation: "", description: "", notes: "" };

export default function BookingRequestPage() {
  useDocumentTitle("Request booking");
  const { vendorId } = useParams();
  const [vendor, setVendor] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [details, setDetails] = useState(emptyDetails);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);
  const requestScope = useRef(null);
  const heading = useRef(null);
  const errorMessage = useRef(null);
  const hasMoved = useRef(false);

  useEffect(() => {
    const scope = { active: true };
    requestScope.current = scope;
    inFlight.current = false;
    hasMoved.current = false;
    setSubmitting(false);
    setLoading(true);
    setError("");
    setVendor(null);
    setAvailability(null);
    setDetails(emptyDetails);
    setStep(0);
    setSent(false);
    Promise.all([getVendorById(vendorId), getVendorAvailability(vendorId)])
      .then(([profile, data]) => {
        if (scope.active) {
          setVendor(profile);
          setAvailability(data.availability);
        }
      })
      .catch(err => { if (scope.active) setError(getApiError(err, "Unable to load booking details.")); })
      .finally(() => { if (scope.active) setLoading(false); });
    return () => { scope.active = false; };
  }, [vendorId]);

  useEffect(() => {
    if (hasMoved.current || sent) heading.current?.focus();
  }, [step, sent]);
  useEffect(() => {
    if (error) errorMessage.current?.focus();
  }, [error]);

  const blockedDates = [...new Set([...(availability?.unavailableDates || []), ...(availability?.bookedDates || [])])].sort();
  const blocked = blockedDates.includes(details.eventDate);
  const change = event => {
    const { name, value } = event.target;
    setDetails(current => ({ ...current, [name]: value }));
    setError("");
  };
  const moveTo = next => {
    if (inFlight.current) return;
    hasMoved.current = true;
    setError("");
    setStep(next);
  };
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current) return;
    setError("");
    if (blocked) {
      setError("This date is unavailable. Please choose another date.");
      setStep(0);
      return;
    }
    if ((step === 0 || step === 2) && (!details.eventDate || details.eventDate < todayDate() || !details.eventType.trim() || !details.eventLocation.trim())) {
      setStep(0);
      setError("Choose today or a future event date and add your event type and location.");
      return;
    }
    if (step >= 1 && details.description.trim().length < 10) {
      setStep(1);
      setError("Add at least 10 characters to your event description.");
      return;
    }
    if (!event.currentTarget.reportValidity()) return;
    if (step < 2) {
      moveTo(step + 1);
      return;
    }
    const scope = requestScope.current;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await createBooking({ vendorId, ...details });
      if (scope.active) setSent(true);
    } catch (err) {
      if (scope.active) setError(getApiError(err, "Unable to send booking request."));
    } finally {
      if (scope.active) {
        inFlight.current = false;
        setSubmitting(false);
      }
    }
  };

  if (loading) return <section className="container-shell py-12" aria-label="Loading booking details"><LoadingSkeleton /></section>;
  if (!vendor || !availability) return <section className="container-shell py-12"><EmptyState title="Booking unavailable" description={error || "Please try again later."} actionTo="/vendors" actionLabel="Browse vendors" /></section>;
  if (sent) return <section className="container-shell grid min-h-[70vh] place-items-center py-16">
    <div className="w-full max-w-lg rounded-[2rem] border border-ink/10 bg-white px-6 py-12 text-center shadow-soft sm:px-12">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-sage"><CheckCircle2 className="h-9 w-9 text-ink" aria-hidden="true" /></span>
      <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-coral">A little closer to your celebration</p>
      <h1 ref={heading} tabIndex={-1} className="mt-3 font-editorial text-4xl focus:outline-none sm:text-5xl">Request sent!</h1>
      <p className="mt-4 text-sm leading-7 text-ink/65">{vendor.businessName} will review your request for {formatDate(details.eventDate)}. Follow its progress in your bookings.</p>
      <Button to="/customer/dashboard" className="mt-8 w-full sm:w-auto">View my bookings <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
    </div>
  </section>;

  return <section className="container-shell py-6 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <Button to={`/vendors/${vendorId}`} variant="ghost" className="!px-0"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Vendor profile</Button>
      <header className="mb-7 mt-5 sm:mb-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">Make it a date</p>
        <h1 className="mt-3 font-editorial text-4xl leading-tight sm:text-5xl">Your celebration starts here.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink/65">A few details, a thoughtful brief, and your plans are on their way.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:gap-8">
        <div className="min-w-0 rounded-[1.75rem] border border-ink/10 bg-white p-5 shadow-soft sm:p-8">
          <ol aria-label="Booking progress" className="mb-8 grid grid-cols-3 gap-2 border-b border-ink/10 pb-6">
            {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>
              <button type="button" disabled={index > step || submitting} onClick={() => moveTo(index)} className={`flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-[11px] font-semibold sm:text-xs ${step === index ? "text-coral" : index < step ? "text-ink" : "text-ink/65"}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] ${index < step ? "bg-sage text-ink" : step === index ? "bg-coral text-white" : "bg-sand text-ink/65"}`}>{index < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : `0${index + 1}`}</span>{label}
              </button>
            </li>)}
          </ol>
          <h2 ref={heading} tabIndex={-1} className="font-editorial text-3xl focus:outline-none">{["Tell us about your event.", "Bring your vision to life.", "One last look."][step]}</h2>
          <p className="mt-2 text-sm leading-6 text-ink/65">{["Choose your date and where it all happens.", "Help your vendor understand what you have in mind.", "Review your details before sending them to the vendor."][step]}</p>
          {error && <p ref={errorMessage} tabIndex={-1} role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800 focus:outline-none">{error}</p>}
          <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={submitting}>
            {step === 0 && <>
              <label className="block min-w-0"><span className="label">Event date</span><input required name="eventDate" type="date" min={todayDate()} value={details.eventDate} onChange={change} className="field min-w-0" aria-invalid={blocked || undefined} aria-describedby={blocked ? "unavailable-date" : "date-help"} /></label>
              {blocked ? <p id="unavailable-date" role="alert" className="!mt-2 text-sm text-red-800">This date is unavailable or already booked.</p> : <p id="date-help" className="!mt-2 text-xs leading-5 text-ink/65">Choose today or a future date. The vendor will confirm your request.</p>}
              {blockedDates.length > 0 && <details className="rounded-xl bg-sand/60 px-4 py-3 text-xs text-ink/65"><summary className="cursor-pointer font-semibold">View unavailable dates</summary><ul className="mt-3 grid grid-cols-2 gap-2">{blockedDates.filter(value => value >= todayDate()).map(value => <li key={value}>{formatDate(value)}</li>)}</ul></details>}
              <label className="block"><span className="label">Event type</span><input required name="eventType" maxLength={100} value={details.eventType} onChange={change} className="field" placeholder="Wedding, birthday, corporate event…" /></label>
              <label className="block"><span className="label">Event location</span><input required name="eventLocation" maxLength={250} value={details.eventLocation} onChange={change} className="field" placeholder="Venue and city" autoComplete="off" /></label>
            </>}
            {step === 1 && <>
              <label className="block"><span className="label">Event description</span><textarea required name="description" minLength={10} maxLength={2000} rows={5} value={details.description} onChange={change} className="field resize-y" placeholder="Tell the vendor about your event and the services you need." aria-describedby="description-help" /></label>
              <p id="description-help" className="!mt-2 text-xs leading-5 text-ink/65">Include the style, guest count, or services you have in mind. At least 10 characters.</p>
              <label className="block"><span className="label">Customer notes (optional)</span><textarea name="notes" maxLength={1000} rows={3} value={details.notes} onChange={change} className="field resize-y" placeholder="Anything else the vendor should know" /></label>
            </>}
            {step === 2 && <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-4"><span className="text-xs text-ink/65">{Number(vendor.pricing) > 0 ? "Starting price" : "Service pricing"}</span><strong className="text-lg">{Number(vendor.pricing) > 0 ? formatCurrency(vendor.pricing) : "Price on request"}</strong></div>
              <dl className="divide-y divide-ink/10 rounded-2xl bg-sand/50 px-4 sm:px-5">
                {[["Event date", formatDate(details.eventDate)], ["Event type", details.eventType], ["Event location", details.eventLocation], ["Event description", details.description], ...(details.notes ? [["Customer notes", details.notes]] : [])].map(([label, value]) => <div key={label} className="py-4"><dt className="text-[11px] font-bold uppercase tracking-wider text-ink/65">{label}</dt><dd className="mt-1.5 whitespace-pre-line break-words text-sm leading-6">{value}</dd></div>)}
              </dl>
              <div className="flex gap-3 rounded-xl border border-ink/10 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-coral" aria-hidden="true" /><p className="text-xs leading-6 text-ink/65">This sends a booking request. The vendor will review your plans and confirm availability. The starting price is a guide; final service details are agreed with the vendor.</p></div>
            </>}
            <div className="flex flex-col-reverse gap-3 border-t border-ink/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              {step > 0 && <Button type="button" variant="ghost" disabled={submitting} onClick={() => moveTo(step - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />{step === 2 ? "Edit details" : "Back"}</Button>}
              <Button type="submit" loading={submitting} disabled={submitting || blocked} className="w-full sm:ml-auto sm:w-auto">{step === 2 ? "Send booking request" : step === 1 ? "Review request" : "Continue"}{step < 2 && <ArrowRight className="h-4 w-4" aria-hidden="true" />}</Button>
            </div>
          </form>
        </div>
        <aside className="order-first min-w-0 overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white lg:order-last lg:sticky lg:top-28">
          <div className="flex items-center gap-4 p-4 lg:block lg:p-0"><img src={getVendorImage(vendor)} alt={vendor.businessName} width={620} height={420} className="h-20 w-20 shrink-0 rounded-xl object-cover lg:aspect-[1.5] lg:h-auto lg:w-full lg:rounded-none" /><div className="min-w-0 lg:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-coral">{vendor.serviceCategory}</p><h2 className="mt-1 break-words text-base font-bold lg:mt-2 lg:text-xl">{vendor.businessName}</h2><p className="mt-2 flex items-center gap-1.5 text-xs text-ink/65"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{vendor.location}</p><p className="mt-3 text-xs text-ink/65 lg:mt-5">{Number(vendor.pricing) > 0 ? <>Starting at <strong className="ml-1 text-base font-bold text-ink">{formatCurrency(vendor.pricing)}</strong></> : <strong className="font-semibold text-ink">Price on request</strong>}</p></div></div>
          <div className="hidden items-start gap-2.5 border-t border-ink/10 bg-sand/50 p-5 text-xs leading-6 text-ink/65 lg:flex"><CalendarDays className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" /><p>A request today. A celebration to look forward to. Track the vendor's response in your bookings.</p></div>
        </aside>
      </div>
    </div>
  </section>;
}
