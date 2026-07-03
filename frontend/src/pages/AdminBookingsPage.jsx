import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, MapPin, DollarSign } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import {api} from "../services/api";
import { getApiError } from "../utils/apiError";

const STATUS_COLORS = {
  pending: "bg-yellow-50 border-yellow-200 text-yellow-700",
  accepted: "bg-green-50 border-green-200 text-green-700",
  rejected: "bg-red-50 border-red-200 text-red-700",
  completed: "bg-blue-50 border-blue-200 text-blue-700",
  cancelled: "bg-gray-50 border-gray-200 text-gray-700",
};

export default function AdminBookingsPage() {
  useDocumentTitle("View Bookings - Admin");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/");
      return;
    }

    loadBookings();
  }, [user, navigate, statusFilter]);

  const loadBookings = async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/admin/bookings", {
        params: {
          page,
          limit: 15,
          status: statusFilter || undefined,
        },
      });
      setBookings(response.data.data?.bookings || response.data.bookings || []);
      setPagination(response.data.data?.pagination || response.data.pagination);
    } catch (err) {
      setError(getApiError(err, "Failed to load bookings"));
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <section className="section-pad container-shell min-h-screen">
        <EmptyState
          title="Access Denied"
          description="You do not have permission to access this page."
        />
      </section>
    );
  }

  return (
    <section className="section-pad container-shell">
      <div className="max-w-6xl">
        <div className="mb-8">
          <Button to="/admin" variant="outline" size="sm" className="mb-4">
            ← Back to Dashboard
          </Button>
          <h1 className="text-4xl font-extrabold">View Bookings</h1>
          <p className="mt-2 text-ink/50">
            View all bookings and their status
          </p>
        </div>

        {/* Status Filter */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setStatusFilter("")}
            className={`whitespace-nowrap rounded-full px-4 py-2 font-semibold ${
              statusFilter === ""
                ? "bg-coral text-white"
                : "border bg-white hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {["pending", "accepted", "rejected", "completed", "cancelled"].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`whitespace-nowrap rounded-full px-4 py-2 font-semibold capitalize ${
                  statusFilter === status
                    ? "bg-coral text-white"
                    : "border bg-white hover:bg-gray-50"
                }`}
              >
                {status}
              </button>
            ),
          )}
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <EmptyState title="Failed to load bookings" description={error} />
        ) : bookings.length === 0 ? (
          <EmptyState
            title="No bookings found"
            description="There are no bookings to display."
          />
        ) : (
          <>
            <div className="grid gap-4">
              {bookings.map((booking) => (
                <div
                  key={booking._id}
                  className="rounded-[1.75rem] border bg-white p-6 shadow-soft"
                >
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold">
                            {booking.eventType}
                          </h3>
                          <p className="text-sm text-ink/60">
                            {booking.vendorId?.businessName || "Unknown Vendor"}{" "}
                            • Customer:{" "}
                            {booking.customerId?.name || "Unknown"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold border ${
                            STATUS_COLORS[booking.status]
                          }`}
                        >
                          {booking.status.charAt(0).toUpperCase() +
                            booking.status.slice(1)}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 text-ink/50 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-semibold text-ink/60">Date</p>
                            <p>
                              {new Date(booking.eventDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 text-ink/50 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-semibold text-ink/60">Location</p>
                            <p>{booking.eventLocation}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <DollarSign className="mt-0.5 h-4 w-4 text-ink/50 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-semibold text-ink/60">Budget</p>
                            <p>₹{booking.budget.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      {booking.specialRequirements && (
                        <div className="mt-3 text-sm">
                          <p className="font-semibold text-ink/60">
                            Special Requirements
                          </p>
                          <p className="text-ink/70">
                            {booking.specialRequirements}
                          </p>
                        </div>
                      )}
                      <p className="mt-4 text-xs text-ink/50">
                        Booking ID: {booking._id}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: pagination.pages }).map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => loadBookings(i + 1)}
                    className={`px-4 py-2 rounded-lg border font-semibold ${
                      pagination.page === i + 1
                        ? "bg-coral text-white border-coral"
                        : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
