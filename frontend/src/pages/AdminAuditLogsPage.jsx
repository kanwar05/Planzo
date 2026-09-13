import { Download, FileClock, Search } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { exportAuditLogsCsv, getAuditLogs } from "../services/auditService";
import { getApiError } from "../utils/apiError";

const actions = [
  ["", "All actions"], ["vendor_approved", "Vendor approval"],
  ["vendor_rejected", "Vendor rejection"], ["booking_edited", "Booking edits"],
  ["review_deleted", "Review deletion"], ["user_suspended", "User suspension"],
  ["user_unsuspended", "User unsuspension"], ["role_changed", "Role changes"],
  ["login", "Login history"],
];

const label = (action) => action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const valuePreview = (value) => value == null ? "—" : JSON.stringify(value);

export default function AdminAuditLogsPage() {
  useDocumentTitle("Audit Logs - Planzo Admin");
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ search: "", action: "", from: "", to: "" });
  const [query, setQuery] = useState(filters);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getAuditLogs({ ...query, page: pagination.page, limit: 25 })
      .then((result) => {
        setLogs(result.logs);
        setPagination(result.pagination);
      })
      .catch((requestError) => setError(getApiError(requestError, "Unable to load audit logs.")))
      .finally(() => setLoading(false));
  }, [query, pagination.page]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    setQuery(filters);
  };

  const exportCsv = async () => {
    setExporting(true);
    try { await exportAuditLogsCsv(query); }
    catch (requestError) { setError(getApiError(requestError, "Unable to export audit logs.")); }
    finally { setExporting(false); }
  };

  return (
    <section className="section-pad container-shell">
      <Toast message={error} type="error" onClose={() => setError("")} />
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">Administration</p>
          <h1 className="mt-2 text-4xl font-extrabold">Audit logs</h1>
          <p className="mt-2 text-ink/50">A tamper-resistant history of sensitive account and marketplace actions.</p>
        </div>
        <Button variant="outline" loading={exporting} onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <form onSubmit={applyFilters} className="mt-8 grid gap-3 rounded-3xl border bg-white p-4 shadow-soft md:grid-cols-[minmax(220px,1fr)_220px_160px_160px_auto]">
        <label className="relative">
          <span className="sr-only">Search audit logs</span>
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-ink/35" />
          <input className="field !pl-11" placeholder="Target, reason, IP, browser…" value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </label>
        <select aria-label="Action" className="field" value={filters.action}
          onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}>
          {actions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        <input aria-label="From date" className="field" type="date" value={filters.from}
          onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        <input aria-label="To date" className="field" type="date" value={filters.to}
          onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        <Button type="submit">Apply</Button>
      </form>

      <p className="mt-5 text-sm font-semibold text-ink/45">{pagination.total} recorded actions</p>
      {loading ? <div className="mt-4"><LoadingSkeleton /></div> : !logs.length ? (
        <div className="mt-5"><EmptyState title="No audit events found" description="Try broadening the search or date filters." /></div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-3xl border bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead className="bg-ink text-xs uppercase tracking-wider text-white/70">
                <tr>{["Timestamp", "Action", "Admin / actor", "Target", "IP & browser", "Old value", "New value", "Reason"].map((heading) => <th key={heading} className="px-4 py-4">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {logs.map((log) => (
                  <tr key={log._id} className="align-top hover:bg-ink/[0.02]">
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-ink/55">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-bold text-coral">{label(log.action)}</span></td>
                    <td className="px-4 py-4"><p className="font-bold">{log.admin?.name || log.actor?.name || "System"}</p><p className="mt-1 text-xs text-ink/45">{log.admin?.email || log.actor?.email || "—"}</p></td>
                    <td className="px-4 py-4"><p className="font-bold">{log.targetLabel || "Unknown"}</p><p className="mt-1 text-xs text-ink/45">{log.targetType}</p></td>
                    <td className="px-4 py-4"><p>{log.ip}</p><p className="mt-1 text-xs text-ink/45">{log.browser}</p></td>
                    <td className="max-w-[190px] px-4 py-4"><code className="line-clamp-4 break-all text-xs text-ink/55" title={valuePreview(log.oldValue)}>{valuePreview(log.oldValue)}</code></td>
                    <td className="max-w-[190px] px-4 py-4"><code className="line-clamp-4 break-all text-xs text-ink/55" title={valuePreview(log.newValue)}>{valuePreview(log.newValue)}</code></td>
                    <td className="max-w-[220px] px-4 py-4 text-ink/60">{log.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t p-4">
            <Button variant="ghost" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>Previous</Button>
            <span className="text-sm font-bold">Page {pagination.page} of {Math.max(pagination.pages, 1)}</span>
            <Button variant="ghost" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Next</Button>
          </div>
        </div>
      )}
      <div className="mt-6 flex items-center gap-2 text-xs text-ink/40"><FileClock className="h-4 w-4" /> Audit records are read-only and available only to administrators.</div>
    </section>
  );
}
