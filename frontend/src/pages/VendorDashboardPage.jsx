import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import BookingCard from "../components/BookingCard";
import BookingMetrics from "../components/BookingMetrics";
import { bookingStatuses } from "../components/BookingStatus";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
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
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-coral">Your business</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Booking requests</h1>
        <p className="mt-3 text-sm text-ink/55">
          {vendor?.businessName || "Manage the events you help bring to life."}
        </p>
      </div>
      <Button to="/vendor/profile-setup" variant="outline">Manage profile</Button>
    </header>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      <p>
        {error}
      </p>
      <Button variant="outline" onClick={load}>Try again</Button>
    </div>}
    {loading ? <LoadingSkeleton /> : !vendor ? <EmptyState title="Create your business profile" description="Add your services, starting price, and photos to begin." actionTo="/vendor/profile-setup" actionLabel="Create profile" /> : <>
      {vendor.verificationStatus !== "approved" && <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Profile approval: <strong className="capitalize">
          {vendor.verificationStatus || "pending"}
        </strong>. {vendor.verificationRejectionReason || "Your business appears publicly once an admin approves it."}</p>}
      <BookingMetrics bookings={bookings} />
      <label className="block max-w-xs">
        <span className="label">Booking status</span>
        <select className="field" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">All requests</option>
          {bookingStatuses.map(status => <option key={status} value={status}>
            {status[0].toUpperCase() + status.slice(1)}
          </option>)}
        </select>
      </label>
      <div className="space-y-4">
        {shown.length ? shown.map(booking => <BookingCard key={booking._id} booking={booking} role="vendor" busy={Boolean(busy)} onStatus={update} />) : <EmptyState title="No booking requests" description="Customer requests will appear here. Keep your profile and availability up to date." actionTo="/vendor/availability" actionLabel="Manage availability" />}
      </div>
    </>}
  </div>;
}
