import { useEffect, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminStats } from "../services/adminService";
import { getApiError } from "../utils/apiError";
export default function AdminDashboardPage() {
  useDocumentTitle("Admin overview");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    getAdminStats().then(setStats).catch(err => setError(getApiError(err, "Unable to load platform counts."))).finally(() => setLoading(false));
  }, []);
  return <div className="space-y-8">
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Planzo administration</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Platform overview</h1>
      <p className="mt-3 text-sm text-ink/55">Manage accounts, business approvals, and bookings.</p>
    </header>
    {loading ? <LoadingSkeleton /> : !stats ? <EmptyState title="Overview unavailable" description={error} /> : <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {[["Total customers", stats.totalCustomers], ["Total vendors", stats.totalVendors], ["Total bookings", stats.totalBookings], ["Pending bookings", stats.pendingBookings], ["Accepted bookings", stats.acceptedBookings], ["Completed bookings", stats.completedBookings]].map(([label, value]) => <div key={label} className="rounded-3xl border bg-white p-6 shadow-soft">
          <p className="text-sm text-ink/55">
            {label}
          </p>
          <p className="mt-3 text-3xl font-extrabold">
            {value ?? 0}
          </p>
        </div>)}
      </div>
      <div className="rounded-3xl border bg-white p-6 shadow-soft">
        <h2 className="text-xl font-extrabold">Vendor approvals</h2>
        <p className="mt-3 text-sm text-ink/55">{stats.pendingVendors ?? 0} business profiles await review.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button to="/admin/vendors/unverified">Review vendors</Button>
          <Button to="/admin/users" variant="outline">Manage users</Button>
          <Button to="/admin/bookings" variant="outline">View bookings</Button>
        </div>
      </div>
    </>}
  </div>;
}
