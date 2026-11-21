import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, MapPin, UserRound } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import BookingReasonDialog from "../components/BookingReasonDialog";
import BookingQuotations from "../components/BookingQuotations";
import BookingCancellationInfo from "../components/BookingCancellationInfo";
import BookingStatus, { bookingStatuses } from "../components/BookingStatus";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
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
  const [pendingCancellation, setPendingCancellation] = useState(null);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const data = await getAdminBookings({
        status: status || undefined,
        page,
        limit: 12
      });
      if (version === loadVersion.current) {
        setBookings(data.bookings || []);
        setPagination(data.pagination || {});
      }
    } catch (err) {
      if (version === loadVersion.current) setError(getApiError(err, "Unable to load bookings."));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [status, page]);
  useEffect(() => {
    load();
    return () => { loadVersion.current += 1; };
  }, [load]);
  const cancel = async (id, reason, options) => {
    if (busy) return false;
    setBusy(id);
    setError("");
    try {
      await updateBookingStatus(id, "cancelled", ...(options ? [reason, options] : reason === undefined ? [] : [reason]));
      setPendingCancellation(null);
      await load();
      setMessage("Booking cancelled.");
      return true;
    } catch (err) {
      setError(getApiError(err, "Unable to cancel booking."));
      return false;
    } finally {
      setBusy("");
    }
  };
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Booking administration" title="All bookings" description="Follow every event from first request to final celebration." />
    <div className="flex flex-col gap-4 rounded-2xl bg-sand p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div>
        <p className="font-bold">Booking directory</p>
        <p className="mt-1 text-sm leading-6 text-ink/65">Filter requests and manage active bookings.</p>
      </div>
      <label className="block w-full sm:w-56">
        <span className="label">Booking status</span>
        <select className="field !bg-white" disabled={Boolean(busy)} value={status} onChange={event => {
          setStatus(event.target.value);
          setPage(1);
        }}>
          <option value="">All statuses</option>
          {bookingStatuses.map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
        </select>
      </label>
    </div>
    <WorkspaceError message={!pendingCancellation ? error : ""} onRetry={load} />
    {loading ? <LoadingSkeleton /> : <>
      <div className="space-y-4">
        {bookings.length ? bookings.map(booking => <Card as="article" key={booking._id} className="min-w-0 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-coral">{booking.eventType || "Event booking"}</p>
              <h2 className="mt-2 break-words text-lg font-extrabold">
                {booking.vendorId?.businessName || "Vendor unavailable"}
              </h2>
            </div>
            <BookingStatus status={booking.status} />
          </div>
          <dl className="mt-5 grid gap-4 rounded-2xl bg-sand/65 p-4 sm:grid-cols-3">
            <div className="min-w-0"><dt className="flex items-center gap-2 text-xs font-medium text-ink/65"><UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Customer</dt><dd className="mt-1.5 break-words text-sm font-bold">{booking.customerId?.name || "Unavailable"}</dd></div>
            <div className="min-w-0"><dt className="flex items-center gap-2 text-xs font-medium text-ink/65"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Event date</dt><dd className="mt-1.5 text-sm font-bold">{formatDate(booking.eventDate)}</dd></div>
            <div className="min-w-0"><dt className="flex items-center gap-2 text-xs font-medium text-ink/65"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Location</dt><dd className="mt-1.5 break-words text-sm font-bold">{booking.eventLocation}</dd></div>
          </dl>
          <BookingQuotations booking={booking} role="admin" disabled={Boolean(busy)} />
          <BookingCancellationInfo booking={booking} />
          {booking.description && <p className="mt-5 whitespace-pre-line break-words text-sm leading-7 text-ink/75">
            {booking.description}
          </p>}
          {booking.notes && <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-ink/65"><strong className="text-ink">Notes: </strong>{booking.notes}</p>}
          {booking.status === "cancelled" && booking.cancellationReason && <p className="mt-3 whitespace-pre-line break-words text-sm">Cancellation reason: {booking.cancellationReason}</p>}
          {booking.status === "rejected" && booking.rejectionReason && <p className="mt-3 whitespace-pre-line break-words text-sm">Rejection reason: {booking.rejectionReason}</p>}
          {["pending", "accepted"].includes(booking.status) && <div className="mt-5 border-t border-ink/10 pt-4"><Button className="w-full !text-red-800 sm:w-auto" variant="outline" disabled={Boolean(busy)} loading={busy === booking._id} onClick={() => { setError(""); setPendingCancellation(booking); }}>Cancel booking</Button></div>}
        </Card>) : <EmptyState title={error ? "Bookings unavailable" : "No bookings found"} description={error ? "Try again to load the booking directory." : "Booking requests with this status will appear here."} />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} disabled={Boolean(busy)} />
    </>}
    <BookingReasonDialog booking={pendingCancellation} status="cancelled" role="admin" busy={Boolean(busy)} error={pendingCancellation ? error : ""} onClose={() => { if (!busy) setPendingCancellation(null); }} onConfirm={(reason, options) => cancel(pendingCancellation._id, reason, options)} />
  </div>;
}
