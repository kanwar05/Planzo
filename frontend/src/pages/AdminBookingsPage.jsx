import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import BookingStatus, { bookingStatuses } from "../components/BookingStatus";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminBookings } from "../services/adminService";
import { updateBookingStatus } from "../services/bookingService";
import { getApiError } from "../utils/apiError";
import { formatDate } from "../utils/format";
export default function AdminBookingsPage() {
  useDocumentTitle("Manage bookings");
  const [bookings, setBookings] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminBookings({
        status: status || undefined,
        page,
        limit: 12
      });
      setBookings(data.bookings || []);
      setPagination(data.pagination || {});
    } catch (err) {
      setError(getApiError(err, "Unable to load bookings."));
    } finally {
      setLoading(false);
    }
  }, [status, page]);
  useEffect(() => {
    load();
  }, [load]);
  const cancel = async id => {
    setBusy(id);
    setError("");
    try {
      await updateBookingStatus(id, "cancelled");
      await load();
      setMessage("Booking cancelled.");
    } catch (err) {
      setError(getApiError(err, "Unable to cancel booking."));
    } finally {
      setBusy("");
    }
  };
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Booking administration</p>
      <h1 className="mt-2 text-3xl font-extrabold">All bookings</h1>
    </header>
    <label className="block max-w-xs">
      <span className="label">Booking status</span>
      <select className="field" value={status} onChange={event => {
        setStatus(event.target.value);
        setPage(1);
      }}>
        <option value="">All statuses</option>
        {bookingStatuses.map(item => <option key={item} value={item}>
          {item[0].toUpperCase() + item.slice(1)}
        </option>)}
      </select>
    </label>
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    {loading ? <LoadingSkeleton /> : <>
      <div className="space-y-4">
        {bookings.length ? bookings.map(booking => <article key={booking._id} className="rounded-3xl border bg-white p-6 shadow-soft">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-extrabold">
                {booking.vendorId?.businessName || "Vendor unavailable"}
              </h2>
              <p className="mt-2 text-sm text-ink/55">Customer: {booking.customerId?.name || "Unavailable"}</p>
            </div>
            <BookingStatus status={booking.status} />
          </div>
          <p className="mt-4 text-sm text-ink/65">{booking.eventType} · {formatDate(booking.eventDate)} · {booking.eventLocation}</p>
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink/55">
            {booking.description}
          </p>
          {booking.notes && <p className="mt-2 text-sm text-ink/55">Notes: {booking.notes}</p>}
          {["pending", "accepted"].includes(booking.status) && <Button className="mt-5" variant="outline" disabled={Boolean(busy)} loading={busy === booking._id} onClick={() => cancel(booking._id)}>Cancel booking</Button>}
        </article>) : <EmptyState title="No bookings found" description="Booking requests with this status will appear here." />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} />
    </>}
  </div>;
}
