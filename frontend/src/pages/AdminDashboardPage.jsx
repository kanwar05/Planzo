import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BadgeCheck,
  BarChart3,
  Calendar,
  CheckCircle,
  IndianRupee,
  ShieldAlert,
  Users,
  UserRound,
} from "lucide-react";
import Button from "../components/Button";
import DashboardChart from "../components/DashboardChart";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminDashboard } from "../services/dashboardService";
import { getApiError } from "../utils/apiError";
import { formatCurrency, formatDate } from "../utils/format";

function StatCard({ title, value, icon: Icon, tone = "text-coral", to }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-5 shadow-[0_18px_60px_rgba(36,23,42,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-ink/45">{title}</p>
          <p className={`mt-2 text-3xl font-extrabold ${tone}`}>{value}</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink/[0.04]">
          <Icon className={`h-5 w-5 ${tone}`} />
        </span>
      </div>
      {to ? (
        <Button to={to} size="sm" variant="outline" className="mt-4">
          View details
        </Button>
      ) : null}
    </div>
  );
}

function ChartPanel({ title, data, metric, color, type }) {
  return (
    <section className="rounded-2xl border border-ink/8 bg-white p-6 shadow-[0_18px_60px_rgba(36,23,42,0.08)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-extrabold">{title}</h2>
        <BarChart3 className="h-5 w-5 text-coral" />
      </div>
      <DashboardChart
        data={data}
        metric={metric}
        color={color}
        type={type}
        height={170}
      />
    </section>
  );
}

export default function AdminDashboardPage() {
  useDocumentTitle("Admin Dashboard - Planzo");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/");
      return;
    }

    setLoading(true);
    setError("");
    getAdminDashboard({ limit: 8 })
      .then(setDashboard)
      .catch((requestError) =>
        setError(getApiError(requestError, "Failed to load dashboard stats.")),
      )
      .finally(() => setLoading(false));
  }, [user, navigate]);

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

  if (loading) {
    return (
      <section className="section-pad container-shell min-h-screen">
        <LoadingSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section className="section-pad container-shell min-h-screen">
        <EmptyState title="Failed to load dashboard" description={error} />
      </section>
    );
  }

  const summary = dashboard?.summary || {};
  const reports = dashboard?.recentReports?.items || [];
  const activity = dashboard?.platformActivity || [];

  return (
    <section className="section-pad container-shell">
      <div className="max-w-7xl space-y-8">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-xs font-extrabold uppercase text-coral">
            <ShieldAlert className="h-4 w-4" /> Admin Dashboard
          </span>
          <h1 className="mt-4 text-4xl font-extrabold">Platform Analytics</h1>
          <p className="mt-2 text-ink/50">
            Real users, vendors, bookings, revenue, reports, and platform activity.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Users" value={summary.totalUsers || 0} icon={Users} tone="text-blue-700" />
          <StatCard title="Customers" value={summary.customers || 0} icon={UserRound} tone="text-emerald-700" />
          <StatCard title="Vendors" value={summary.vendors || 0} icon={Users} tone="text-indigo-700" />
          <StatCard title="Verified Vendors" value={summary.verifiedVendors || 0} icon={BadgeCheck} tone="text-emerald-700" />
          <StatCard title="Pending Verification" value={summary.pendingVerification || 0} icon={CheckCircle} tone="text-amber-700" to="/admin/vendors/unverified" />
          <StatCard title="Total Bookings" value={summary.totalBookings || 0} icon={Calendar} tone="text-coral" to="/admin/bookings" />
          <StatCard title="Recent Reports" value={dashboard?.recentReports?.pagination?.total || 0} icon={AlertCircle} tone="text-red-600" to="/admin/vendors/reported" />
          <StatCard
            title="Tracked Revenue"
            value={formatCurrency(
              (dashboard?.revenueGraph || []).reduce(
                (total, item) => total + (Number(item.revenue) || 0),
                0,
              ),
            )}
            icon={IndianRupee}
            tone="text-emerald-700"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <ChartPanel
            title="Monthly Bookings"
            data={dashboard?.monthlyBookingGraph || []}
            metric="bookings"
            color="#2563eb"
            type="bar"
          />
          <ChartPanel
            title="Revenue Graph"
            data={dashboard?.revenueGraph || []}
            metric="revenue"
            color="#16a34a"
          />
          <ChartPanel
            title="User Growth"
            data={dashboard?.userGrowth || []}
            metric="users"
            color="#ef6f61"
          />
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-2xl border border-ink/8 bg-white shadow-[0_18px_60px_rgba(36,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/8 p-6">
              <div>
                <h2 className="text-2xl font-extrabold">Recent Reports</h2>
                <p className="mt-1 text-sm text-ink/45">
                  Vendors currently flagged by customers or moderation.
                </p>
              </div>
              <Button to="/admin/vendors/reported" variant="outline">
                Review reports
              </Button>
            </div>
            {reports.length ? (
              <div className="divide-y divide-ink/8">
                {reports.map((vendor) => (
                  <article key={vendor._id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="font-extrabold">{vendor.businessName}</h3>
                        <p className="mt-1 text-sm text-ink/45">
                          {vendor.userId?.email || "No owner email"} · {vendor.location}
                        </p>
                      </div>
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-600">
                        {vendor.reportReasons?.length || 1} report
                      </span>
                    </div>
                    {vendor.reportReasons?.length ? (
                      <p className="mt-3 text-sm text-ink/55">
                        {vendor.reportReasons.join(", ")}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyState
                  title="No recent reports"
                  description="Reported vendors will appear here."
                />
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-ink/8 bg-white p-6 shadow-[0_18px_60px_rgba(36,23,42,0.08)]">
            <h2 className="text-2xl font-extrabold">Platform Activity</h2>
            <div className="mt-5 space-y-3">
              {activity.length ? (
                activity.slice(0, 8).map((item) => (
                  <div key={item._id} className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-extrabold">{item.title}</p>
                    <p className="mt-1 text-xs text-ink/45">
                      {item.actor} · {item.subject} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-ink/50">
                  Platform activity will appear as bookings and reports are created.
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Button to="/admin/vendors/unverified" variant="outline">
            Verify Vendors
          </Button>
          <Button to="/admin/vendors/reported" variant="outline">
            Review Reports
          </Button>
          <Button to="/admin/reviews" variant="outline">
            Moderate Reviews
          </Button>
          <Button to="/admin/bookings" variant="outline">
            View Bookings
          </Button>
        </div>
      </div>
    </section>
  );
}
