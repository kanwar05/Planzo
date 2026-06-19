import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  IndianRupee,
  MapPin,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  getMyBookings,
  updateBookingStatus,
} from "../services/bookingService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";

const statusClass = {
  accepted: "bg-sage/15 text-sage",
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-ink/5 text-ink/50",
  rejected: "bg-red-50 text-red-600",
  cancelled: "bg-ink/5 text-ink/40",
};

export default function CustomerDashboardPage() {
  useDocumentTitle("Customer dashboard");
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .catch((requestError) =>
        setError(getApiError(requestError, "Unable to load your bookings.")),
      )
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const upcoming = bookings.filter(
      (booking) =>
        ["pending", "accepted"].includes(booking.status) &&
        new Date(booking.eventDate) >= new Date(),
    ).length;
    const completed = bookings.filter(
      (booking) => booking.status === "completed",
    ).length;
    return { total: bookings.length, upcoming, completed };
  }, [bookings]);

  const cancelBooking = async (id) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await updateBookingStatus(id, "cancelled");
      setBookings((current) =>
        current.map((booking) => (booking._id === id ? updated : booking)),
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to cancel this booking."));
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <div>
      <Toast message={error} type="error" onClose={() => setError("")} />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold text-coral">
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            Good to see you, {user?.name?.split(" ")[0]}.
          </h1>
          <p className="mt-2 text-sm text-ink/45">
            Here’s what’s happening with your celebrations.
          </p>
        </div>
        <Button to="/vendors">Find a vendor</Button>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {[
          [CalendarCheck, "Total bookings", stats.total, "All requests"],
          [CalendarClock, "Upcoming events", stats.upcoming, "Pending or accepted"],
          [CheckCircle2, "Completed", stats.completed, "Finished events"],
        ].map(([Icon, title, value, note]) => (
          <Card key={title} className="p-6">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold text-sage">{note}</span>
            </div>
            <p className="mt-7 text-3xl font-extrabold">{value}</p>
            <p className="mt-1 text-sm text-ink/45">{title}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-7 overflow-hidden">
        <div className="border-b p-6">
          <h2 className="text-xl font-extrabold">Recent bookings</h2>
          <p className="mt-1 text-xs text-ink/40">
            Track your active and completed requests.
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-ink/45">
            Loading bookings…
          </div>
        ) : bookings.length ? (
          <div className="divide-y">
            {bookings.map((booking) => (
              <div
                key={booking._id}
                className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center lg:grid-cols-[1.4fr_1fr_1fr_auto]"
              >
                <div>
                  <p className="font-bold">
                    {booking.vendorId?.businessName || "Vendor unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-ink/40">
                    {booking.eventType}
                  </p>
                </div>
                <p className="flex items-center gap-2 text-sm text-ink/50">
                  <Clock3 className="h-4 w-4" />{" "}
                  {formatDate(booking.eventDate)}
                </p>
                <p className="flex items-center gap-2 text-sm text-ink/50">
                  <MapPin className="h-4 w-4" /> {booking.eventLocation}
                </p>
                <div className="text-right">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                      statusClass[booking.status]
                    }`}
                  >
                    {booking.status}
                  </span>
                  <p className="mt-2 flex items-center justify-end text-sm font-bold">
                    <IndianRupee className="h-3.5 w-3.5" />
                    {formatCurrency(booking.budget).replace("₹", "")}
                  </p>
                  {["pending", "accepted"].includes(booking.status) && (
                    <button
                      type="button"
                      disabled={updatingId === booking._id}
                      onClick={() => cancelBooking(booking._id)}
                      className="mt-2 text-xs font-bold text-red-500 disabled:opacity-50"
                    >
                      {updatingId === booking._id
                        ? "Cancelling…"
                        : "Cancel booking"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No bookings yet"
              description="Browse vendors and send your first booking request."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
