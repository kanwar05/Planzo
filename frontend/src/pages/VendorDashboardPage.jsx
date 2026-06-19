import {
  CalendarCheck,
  IndianRupee,
  Inbox,
  Star,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  getVendorRequests,
  updateBookingStatus,
} from "../services/bookingService";
import { getMyVendorProfile } from "../services/vendorService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";

export default function VendorDashboardPage() {
  useDocumentTitle("Vendor dashboard");
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([getVendorRequests(), getMyVendorProfile()])
      .then(([bookingResult, profileResult]) => {
        if (bookingResult.status === "fulfilled") {
          setRequests(bookingResult.value);
        } else if (bookingResult.reason.response?.status !== 404) {
          setError(
            getApiError(bookingResult.reason, "Unable to load booking requests."),
          );
        }

        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleRequests = useMemo(() => {
    const view = params.get("view");
    if (view === "accepted") {
      return requests.filter((request) =>
        ["accepted", "completed"].includes(request.status),
      );
    }
    if (view === "requests") {
      return requests.filter((request) => request.status === "pending");
    }
    return requests;
  }, [requests, params]);

  const stats = useMemo(() => {
    const accepted = requests.filter((item) =>
      ["accepted", "completed"].includes(item.status),
    ).length;
    const earnings = requests
      .filter((item) => item.status === "completed")
      .reduce((total, item) => total + item.budget, 0);
    return { accepted, earnings };
  }, [requests]);

  const changeStatus = async (id, status) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await updateBookingStatus(id, status);
      setRequests((current) =>
        current.map((request) => (request._id === id ? updated : request)),
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to update this request."));
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
            Your business at a glance
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            Welcome back, {user?.name?.split(" ")[0]}.
          </h1>
          <p className="mt-2 text-sm text-ink/45">
            You have{" "}
            {requests.filter((request) => request.status === "pending").length}{" "}
            new booking requests waiting.
          </p>
        </div>
        <Button to="/vendor/profile-setup" variant="outline">
          {profile ? "Edit profile" : "Create profile"}
        </Button>
      </div>
      {!profile && !loading && (
        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700">
          Complete your vendor profile before customers can send booking
          requests.
        </div>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [Inbox, "Total requests", requests.length, "All time"],
          [
            CalendarCheck,
            "Accepted bookings",
            stats.accepted,
            "Accepted or completed",
          ],
          [
            IndianRupee,
            "Completed value",
            formatCurrency(stats.earnings),
            "Completed booking budgets",
          ],
          [
            Star,
            "Reviews",
            profile?.rating || "New",
            `${profile?.reviewsCount || 0} total`,
          ],
        ].map(([Icon, title, value, note]) => (
          <Card key={title} className="p-6">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-plum/10 text-plum">
                <Icon className="h-5 w-5" />
              </span>
              <TrendingUp className="h-4 w-4 text-sage" />
            </div>
            <p className="mt-6 text-3xl font-extrabold">{value}</p>
            <p className="mt-1 text-sm text-ink/45">{title}</p>
            <p className="mt-3 text-xs font-semibold text-sage">{note}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-7 overflow-hidden">
        <div className="border-b p-6">
          <h2 className="text-xl font-extrabold">Latest requests</h2>
          <p className="mt-1 text-xs text-ink/40">
            Respond quickly to keep customers informed.
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-ink/45">
            Loading requests…
          </div>
        ) : visibleRequests.length ? (
          <div className="divide-y">
            {visibleRequests.map((request) => (
              <div
                key={request._id}
                className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center lg:grid-cols-[1.2fr_1fr_1fr_auto]"
              >
                <div>
                  <p className="font-bold">
                    {request.customerId?.name || "Customer"}
                  </p>
                  <p className="mt-1 text-xs text-ink/40">
                    {request.eventType} · {request.eventLocation}
                  </p>
                </div>
                <p className="text-sm text-ink/50">
                  {formatDate(request.eventDate)}
                </p>
                <p className="text-sm font-bold">
                  {formatCurrency(request.budget)}
                </p>
                <div className="flex items-center justify-end gap-2">
                  {request.status === "pending" && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updatingId === request._id}
                        onClick={() => changeStatus(request._id, "rejected")}
                        className="!px-4 !py-2"
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        disabled={updatingId === request._id}
                        onClick={() => changeStatus(request._id, "accepted")}
                        className="!px-4 !py-2"
                      >
                        Accept
                      </Button>
                    </>
                  )}
                  {request.status === "accepted" && (
                    <Button
                      type="button"
                      disabled={updatingId === request._id}
                      onClick={() => changeStatus(request._id, "completed")}
                      className="!px-4 !py-2"
                    >
                      Mark complete
                    </Button>
                  )}
                  {!["pending", "accepted"].includes(request.status) && (
                    <span className="rounded-full bg-ink/5 px-3 py-1.5 text-xs font-bold capitalize text-ink/50">
                      {request.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="No booking requests"
              description="New customer requests will appear here."
            />
          </div>
        )}
      </Card>
    </div>
  );
}
