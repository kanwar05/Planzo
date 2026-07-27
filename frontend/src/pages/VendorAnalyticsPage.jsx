import { useEffect, useState } from "react";
import {
  Banknote,
  CalendarCheck,
  Download,
  RefreshCw,
  Star,
  TrendingUp,
  UserRoundCheck,
} from "lucide-react";
import Button from "../components/Button";
import DashboardChart from "../components/DashboardChart";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  exportVendorAnalytics,
  getVendorDashboard,
} from "../services/dashboardService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";

const inputDate = (date) => date.toISOString().slice(0, 10);

export default function VendorAnalyticsPage() {
  useDocumentTitle("Vendor Analytics - Planzo");
  const today = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const [range, setRange] = useState({
    startDate: inputDate(sixMonthsAgo),
    endDate: inputDate(today),
  });
  const [appliedRange, setAppliedRange] = useState(range);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getVendorDashboard(appliedRange)
      .then(setDashboard)
      .catch((err) => setError(getApiError(err, "Unable to load analytics.")))
      .finally(() => setLoading(false));
  }, [appliedRange]);

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const blob = await exportVendorAnalytics(appliedRange);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vendor-analytics-${appliedRange.endDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getApiError(err, "Unable to export analytics."));
    } finally {
      setExporting(false);
    }
  };

  const summary = dashboard?.summary || {};
  const cards = [
    ["Revenue", formatCurrency(summary.totalEarnings || 0), Banknote],
    ["Bookings", summary.totalBookings || 0, CalendarCheck],
    ["Acceptance", `${summary.acceptanceRate || 0}%`, UserRoundCheck],
    ["Cancellation", `${summary.cancellationRate || 0}%`, RefreshCw],
    ["Conversion", `${summary.conversionRate || 0}%`, TrendingUp],
    ["Monthly growth", `${summary.monthlyGrowth > 0 ? "+" : ""}${summary.monthlyGrowth || 0}%`, TrendingUp],
    ["Repeat customers", `${summary.repeatCustomerRate || 0}%`, UserRoundCheck],
    ["Average rating", summary.averageRating || "New", Star],
  ];

  return (
    <section className="space-y-6">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-coral">Performance</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Vendor analytics</h1>
          <p className="mt-2 text-ink/50">Track demand, revenue, customers, and reputation.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-3 shadow-soft sm:flex-row sm:items-end">
          <label className="text-xs font-bold text-ink/55">
            From
            <input aria-label="Analytics start date" type="date" value={range.startDate} onChange={(e) => setRange((value) => ({ ...value, startDate: e.target.value }))} className="field mt-1" />
          </label>
          <label className="text-xs font-bold text-ink/55">
            To
            <input aria-label="Analytics end date" type="date" value={range.endDate} onChange={(e) => setRange((value) => ({ ...value, endDate: e.target.value }))} className="field mt-1" />
          </label>
          <Button onClick={() => setAppliedRange(range)}>Apply</Button>
          <Button variant="outline" loading={exporting} onClick={downloadCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {loading ? <LoadingSkeleton /> : !dashboard?.profile ? (
        <EmptyState title="Complete your vendor profile" description="Analytics begin after your vendor profile is created." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(([label, value, Icon]) => (
              <article key={label} className="rounded-2xl border bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink/50">{label}</p>
                  <Icon className="h-5 w-5 text-coral" />
                </div>
                <p className="mt-4 text-2xl font-extrabold">{value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-2xl border bg-white p-5 shadow-soft sm:p-6">
              <h2 className="text-xl font-extrabold">Revenue trend</h2>
              <p className="mb-5 text-sm text-ink/45">Accepted and completed booking value</p>
              <DashboardChart data={dashboard.monthlyStats} metric="revenue" />
            </article>
            <article className="rounded-2xl border bg-white p-5 shadow-soft sm:p-6">
              <h2 className="text-xl font-extrabold">Booking trend</h2>
              <p className="mb-5 text-sm text-ink/45">Monthly incoming demand</p>
              <DashboardChart data={dashboard.monthlyStats} metric="bookings" type="bar" color="#2563eb" />
            </article>
            <article className="rounded-2xl border bg-white p-5 shadow-soft sm:p-6">
              <h2 className="text-xl font-extrabold">Popular services</h2>
              <div className="mt-5 space-y-4">
                {dashboard.popularServices.map((item, index) => (
                  <div key={item.service}>
                    <div className="flex justify-between gap-3 text-sm"><strong>{item.service}</strong><span>{item.bookings} bookings · {formatCurrency(item.revenue)}</span></div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-coral" style={{ width: `${Math.max(8, 100 - index * 14)}%` }} /></div>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border bg-white p-5 shadow-soft sm:p-6">
              <h2 className="text-xl font-extrabold">Customer locations</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="text-ink/40"><tr><th className="pb-3">Location</th><th>Customers</th><th>Bookings</th></tr></thead>
                  <tbody className="divide-y">{dashboard.customerDemographics.locations.map((item) => <tr key={item.location}><td className="py-3 font-bold">{item.location}</td><td>{item.customers}</td><td>{item.bookings}</td></tr>)}</tbody>
                </table>
              </div>
            </article>
            <article className="rounded-2xl border bg-white p-5 shadow-soft sm:p-6 xl:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-xl font-extrabold">Review trends</h2><p className="text-sm text-ink/45">Average rating by month</p></div>
                <p className="text-sm font-bold">{summary.reviewCount || 0} total reviews</p>
              </div>
              <div className="mt-5"><DashboardChart data={dashboard.reviewTrends} metric="averageRating" color="#f59e0b" /></div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
