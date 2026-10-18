import { useCallback, useEffect, useState } from "react";
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
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-coral">Your celebrations</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">My bookings</h1>
        <p className="mt-3 text-sm text-ink/55">Track requests and contact vendors after acceptance.</p>
      </div>
      <Button to="/vendors">Find vendors</Button>
    </header>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      <p>
        {error}
      </p>
      <Button variant="outline" onClick={load}>Try again</Button>
    </div>}
    {loading ? <LoadingSkeleton /> : <>
      <BookingMetrics bookings={bookings} />
      <label className="block max-w-xs">
        <span className="label">Booking status</span>
        <select className="field" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">All bookings</option>
          {bookingStatuses.map(status => <option key={status} value={status}>
            {status[0].toUpperCase() + status.slice(1)}
          </option>)}
        </select>
      </label>
      <div className="space-y-4">
        {shown.length ? shown.map(booking => <BookingCard key={booking._id} booking={booking} busy={Boolean(busy)} onStatus={update} />) : <EmptyState title={filter ? "No matching bookings" : "No bookings yet"} description={filter ? "Choose another status to see your requests." : "Find a vendor and send your first booking request."} actionTo="/vendors" actionLabel="Browse vendors" />}
      </div>
    </>}
  </div>;
}
