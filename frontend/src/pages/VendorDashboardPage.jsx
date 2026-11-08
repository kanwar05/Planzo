import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Clock3 } from "lucide-react";
import Button from "../components/Button";
import BookingCard from "../components/BookingCard";
import BookingMetrics from "../components/BookingMetrics";
import { bookingStatuses } from "../components/BookingStatus";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getVendorRequests, updateBookingStatus } from "../services/bookingService";
import { getMyVendorProfile } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
export default function VendorDashboardPage() {
  useDocumentTitle("Booking requests");
  const [bookings, setBookings] = useState([]);
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const profile = await getMyVendorProfile();
      setVendor(profile);
      setBookings(profile ? await getVendorRequests() : []);
    } catch (err) {
      if (err.response?.status === 404) setVendor(null);else setError(getApiError(err, "Unable to load booking requests."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const update = async (id, status) => {
    if (busy) return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await updateBookingStatus(id, status);
      setBookings(await getVendorRequests());
      setMessage(status === "completed" ? "Booking marked completed." : `Booking ${status}.`);
    } catch (err) {
      setError(getApiError(err, "Unable to update this request."));
    } finally {
      setBusy("");
    }
  };
  const shown = bookings.filter(booking => !filter || booking.status === filter);
  const pendingCount = bookings.filter(booking => booking.status === "pending").length;
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Your business" title="Booking requests" description={vendor?.businessName ? `${vendor.businessName} · Every detail, in one place.` : "Manage the events you help bring to life."} action={<Button to="/vendor/profile-setup" variant="outline">Manage profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Button>} />
    <WorkspaceError message={error} onRetry={load} />
    {loading ? <LoadingSkeleton /> : !vendor ? <EmptyState title="Create your business profile" description="Add your services, starting price, and photos to begin." actionTo="/vendor/profile-setup" actionLabel="Create profile" /> : <>
      {vendor.verificationStatus !== "approved" && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Profile approval: <strong className="capitalize">
          {vendor.verificationStatus || "pending"}
        </strong>. {vendor.verificationRejectionReason || "Your business appears publicly once an admin approves it."}</p>}
      <BookingMetrics bookings={bookings} />
      <div className="grid gap-4 rounded-3xl bg-sand p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-coral"><Clock3 className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-bold">{pendingCount ? `${pendingCount} ${pendingCount === 1 ? "request needs" : "requests need"} your attention` : "You're up to date"}</h2>
            <p className="mt-1 text-sm leading-6 text-ink/65">{pendingCount ? "Review event details before accepting a request." : "New customer requests will appear here."}</p>
          </div>
        </div>
        <Button to="/vendor/availability" variant="outline" className="w-full sm:w-auto"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Manage availability</Button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold">Your requests</h2>
          <p className="mt-1 text-sm text-ink/65" aria-live="polite">{shown.length} {shown.length === 1 ? "request" : "requests"}{filter ? ` · ${filter}` : " in total"}</p>
        </div>
        <label className="block w-full sm:w-56">
          <span className="label">Booking status</span>
          <select className="field" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="">All requests</option>
            {bookingStatuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-4">
        {shown.length ? shown.map(booking => <BookingCard key={booking._id} booking={booking} role="vendor" busy={Boolean(busy)} onStatus={update} />) : filter ? <div className="space-y-3"><EmptyState title="No matching requests" description={`There are no ${filter} booking requests.`} /><Button variant="outline" onClick={() => setFilter("")}>Show all requests</Button></div> : <EmptyState title="No booking requests" description="Customer requests will appear here. Keep your profile and availability up to date." actionTo="/vendor/availability" actionLabel="Manage availability" />}
      </div>
    </>}
  </div>;
}
