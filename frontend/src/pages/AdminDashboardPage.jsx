import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CalendarCheck2, CalendarDays, CheckCircle2, Clock3, ShieldCheck, Store, Users } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminStats } from "../services/adminService";
import { getApiError } from "../utils/apiError";
export default function AdminDashboardPage() {
  useDocumentTitle("Admin overview");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await getAdminStats());
    } catch (err) {
      setError(getApiError(err, "Unable to load platform counts."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="space-y-6 sm:space-y-8">
    <WorkspaceHeader eyebrow="Planzo administration" title="Platform overview" description="A considered view of your marketplace. Manage people, profiles, and the celebrations they create." />
    <WorkspaceError message={error} onRetry={load} />
    {loading ? <LoadingSkeleton /> : !stats ? <EmptyState title="Overview unavailable" description="Platform counts could not be loaded. Try again to refresh the overview." /> : <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {[["Total customers", stats.totalCustomers, Users], ["Total vendors", stats.totalVendors, Store], ["Total bookings", stats.totalBookings, CalendarDays], ["Pending bookings", stats.pendingBookings, Clock3], ["Accepted bookings", stats.acceptedBookings, CalendarCheck2], ["Completed bookings", stats.completedBookings, CheckCircle2]].map(([label, value, Icon]) => <Card key={label} className="min-w-0 p-4 sm:p-6">
          <Icon className="h-5 w-5 text-coral" aria-hidden="true" />
          <p className="mt-5 text-xs font-semibold leading-5 text-ink/65 sm:text-sm">{label}</p>
          <p className="mt-1 break-words text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">{(value ?? 0).toLocaleString()}</p>
        </Card>)}
      </div>
      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white sm:p-8">
          <ShieldCheck className="h-7 w-7 text-[#E9B5A5]" aria-hidden="true" />
          <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">Marketplace quality</p>
          <h2 className="mt-2 font-editorial text-3xl font-normal">Vendor approvals</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">{stats.pendingVendors ?? 0} business profiles await review. Help customers discover trusted event professionals.</p>
          <Button to="/admin/vendors/unverified" className="mt-6 !bg-white !text-ink hover:!bg-sand">Review vendors <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-extrabold">Keep things running smoothly</h2>
          <p className="mt-2 text-sm leading-6 text-ink/65">Find the right workspace for your next task.</p>
          <div className="mt-5 space-y-3">
            <Button to="/admin/users" variant="outline" className="w-full !justify-between !rounded-2xl !p-4"><span className="flex items-center gap-3"><Users className="h-5 w-5 text-coral" aria-hidden="true" /> Manage users</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Button>
            <Button to="/admin/bookings" variant="outline" className="w-full !justify-between !rounded-2xl !p-4"><span className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-coral" aria-hidden="true" /> View bookings</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
        </Card>
      </section>
    </>}
  </div>;
}
