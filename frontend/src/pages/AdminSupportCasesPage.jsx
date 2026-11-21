import { useEffect, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import { supportCategories, supportStatuses } from "../data/supportCases";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminSupportCases } from "../services/supportService";
import { getApiError } from "../utils/apiError";

export default function AdminSupportCasesPage() {
  useDocumentTitle("Support investigations");
  const [status, setStatus] = useState(""), [category, setCategory] = useState(""), [assignedTo, setAssignedTo] = useState(""), [page, setPage] = useState(1);
  const [rows, setRows] = useState([]), [pagination, setPagination] = useState({}), [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    getAdminSupportCases({ status: status || undefined, category: category || undefined, assignedTo: assignedTo || undefined, page, limit: 12 })
      .then(result => { if (active) { setRows(result.cases || []); setPagination(result.pagination || {}); } })
      .catch(err => { if (active) setError(getApiError(err, "Support cases could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, category, assignedTo, page, retry]);
  const filter = setter => event => { setter(event.target.value); setPage(1); };
  return <div className="space-y-6"><header><p className="text-xs font-bold uppercase tracking-wider text-coral">Support administration</p><h1 className="mt-2 font-editorial text-4xl">Support investigations</h1><p className="mt-3 text-sm leading-7 text-ink/65">Review evidence, assign cases and record decisions. These actions do not execute booking or financial transitions.</p></header>
    <div className="grid gap-4 rounded-2xl bg-sand p-4 sm:grid-cols-3 sm:p-5"><label><span className="label">Case status</span><select value={status} onChange={filter(setStatus)} className="field"><option value="">All statuses</option>{Object.entries(supportStatuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label><span className="label">Case category</span><select value={category} onChange={filter(setCategory)} className="field"><option value="">All categories</option>{Object.entries(supportCategories).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label><span className="label">Case assignment</span><select value={assignedTo} onChange={filter(setAssignedTo)} className="field"><option value="">All assignments</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></label></div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry cases</Button></div>}
    {loading ? <LoadingSkeleton /> : rows.length ? <><div className="space-y-3">{rows.map(item => <article key={item._id} className="rounded-2xl border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold">{item.subject}</h2><p className="mt-2 text-xs leading-6 text-ink/65">{supportCategories[item.category] || item.category} · {supportStatuses[item.status] || item.status}</p><p className="text-xs leading-6 text-ink/65">{item.assigned ? "Assigned" : "Unassigned"} · Revision {item.revision}</p></div><Button to={`/support/cases/${item._id}`} variant="outline">Review case</Button></div></article>)}</div><Pagination pagination={pagination} page={page} onPage={setPage} /></> : !error && <EmptyState title="No matching support cases" description="Change a filter or return when a booking participant opens a case." />}
  </div>;
}
