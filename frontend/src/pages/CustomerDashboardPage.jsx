import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import Button from "../components/Button";
import BookingCard from "../components/BookingCard";
import BookingMetrics from "../components/BookingMetrics";
import { bookingStatuses } from "../components/BookingStatus";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getMyBookings, updateBookingStatus } from "../services/bookingService";
import { getApiError } from "../utils/apiError";
export default function CustomerDashboardPage() {
  useDocumentTitle("My bookings");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBookings(await getMyBookings());
    } catch (err) {
      setError(getApiError(err, "Unable to load bookings."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const update = async (id, status) => {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await updateBookingStatus(id, status);
      setBookings(await getMyBookings());
      setMessage("Booking cancelled.");
    } catch (err) {
      setError(getApiError(err, "Unable to cancel this booking."));
    } finally {
      setBusy("");
    }
  };
  const shown = bookings.filter(booking => !filter || booking.status === filter);
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-coral">Your celebrations, coming together</p>
        <h1 className="mt-3 font-editorial text-4xl sm:text-5xl">My bookings</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-ink/65">Every detail in one place. Follow your requests and find your vendor's contact details once accepted.</p>
      </div>
      <Button to="/vendors" variant="dark">Find vendors <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Button>
    </header>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      <p>
        {error}
      </p>
      <Button variant="outline" onClick={load}>Try again</Button>
    </div>}
    {loading ? <LoadingSkeleton /> : <>
      <BookingMetrics bookings={bookings} />
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-5">
        <div className="flex items-center gap-2.5"><CalendarDays className="h-5 w-5 text-coral" aria-hidden="true" /><h2 className="text-base font-bold">Your booking history</h2><span className="rounded-full bg-sand px-2.5 py-1 text-xs font-semibold tabular-nums">{shown.length}</span></div>
        <label className="block w-full sm:w-48">
        <span className="label !text-[11px]">Booking status</span>
        <select className="field !py-2.5 !text-xs" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">All bookings</option>
          {bookingStatuses.map(status => <option key={status} value={status}>
            {status[0].toUpperCase() + status.slice(1)}
          </option>)}
        </select>
      </label>
      </div>
      <div className="space-y-4">
        {shown.length ? shown.map(booking => <BookingCard key={booking._id} booking={booking} busy={Boolean(busy)} onStatus={update} />) : <EmptyState title={filter ? "No matching bookings" : "No bookings yet"} description={filter ? "Choose another status to see your requests." : "Find a vendor and send your first booking request."} actionTo="/vendors" actionLabel="Browse vendors" />}
      </div>
    </>}
  </div>;
}
