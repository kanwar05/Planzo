import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, MapPin, ShieldCheck, Store, UserRound } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import Dialog from "../components/Dialog";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminVendors, getVendorModerationAudit, reviewVendor, setVendorSuspension } from "../services/adminService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";
import { getVendorGallery } from "../utils/vendor";

function ModerationHistory({ vendor }) {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getVendorModerationAudit(vendor._id, { page, limit: 10 }).then(data => {
      if (active) {
        setRecords(data.records || []);
        setPagination(data.pagination || {});
      }
    }).catch(err => {
      if (active) setError(getApiError(err, "Unable to load moderation history."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vendor._id, page, attempt]);
  return <div className="space-y-4">
    <WorkspaceError message={error} onRetry={() => setAttempt(value => value + 1)} />
    {loading ? <LoadingSkeleton /> : records.length ? <ol className="space-y-3" aria-label="Moderation records">
      {records.map(record => <li key={record._id} className="rounded-2xl bg-sand p-4 text-sm leading-6">
        <p className="font-bold">{{ approve: "Listing approved", reject: "Listing rejected", suspend: "Account suspended", restore: "Account restored" }[record.action] || "Moderation action"}</p>
        <p className="text-xs text-ink/65">{record.actorId?.name || "Administrator"} · {new Date(record.createdAt).toLocaleString()}</p>
        {record.reason && <p className="mt-2 whitespace-pre-line break-words">{record.reason}</p>}
      </li>)}
    </ol> : !error && <p className="text-sm text-ink/65">No moderation actions have been recorded for this listing.</p>}
    {!loading && <Pagination pagination={pagination} page={page} onPage={setPage} />}
  </div>;
}

export default function AdminVerifyVendorsPage() {
  useDocumentTitle("Vendor approvals");
  const [vendors, setVendors] = useState([]);
  const [status, setStatus] = useState("pending");
  const [suspended, setSuspended] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [reasons, setReasons] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorVendor, setErrorVendor] = useState("");
  const [message, setMessage] = useState("");
  const [historyVendor, setHistoryVendor] = useState(null);
  const [suspensionVendor, setSuspensionVendor] = useState(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [suspensionError, setSuspensionError] = useState("");
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    setErrorVendor("");
    try {
      const data = await getAdminVendors({
        status: status || undefined,
        suspended: suspended || undefined,
        search: search || undefined,
        page,
        limit: 8
      });
      if (version === loadVersion.current) {
        setVendors(data.vendors || []);
        setPagination(data.pagination || {});
      }
    } catch (err) {
      if (version === loadVersion.current) setError(getApiError(err, "Unable to load vendors."));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [status, suspended, search, page]);
  useEffect(() => {
    load();
    return () => { loadVersion.current += 1; };
  }, [load]);
  const review = async (vendor, approved) => {
    if (busy) return;
    const id = vendor._id;
    setErrorVendor(id);
    if (!approved && !reasons[id]?.trim()) {
      setError("Provide a reason so the vendor can improve their profile.");
      document.getElementById(`review-reason-${id}`)?.focus();
      return;
    }
    setBusy(id);
    setError("");
    try {
      await reviewVendor(id, approved, reasons[id]?.trim(), vendor.profileRevision ?? 0);
      await load();
      setMessage(approved ? "Vendor approved." : "Vendor rejected.");
    } catch (err) {
      setError(getApiError(err, "Unable to review vendor."));
    } finally {
      setBusy("");
    }
  };
  const changeSuspension = async () => {
    if (busy || !suspensionVendor) return;
    const shouldSuspend = !(suspensionVendor.suspended || suspensionVendor.userId?.suspendedAt);
    if (shouldSuspend && !suspensionReason.trim()) {
      setSuspensionError("Provide a reason for suspending this vendor account.");
      return;
    }
    setBusy(suspensionVendor._id);
    setSuspensionError("");
    try {
      await setVendorSuspension(suspensionVendor._id, shouldSuspend, suspensionReason.trim(), suspensionVendor.profileRevision ?? 0);
      setSuspensionVendor(null);
      await load();
      setMessage(shouldSuspend ? "Vendor account suspended." : "Vendor account restored.");
    } catch (err) {
      setSuspensionError(getApiError(err, "Unable to change vendor suspension. Refresh the directory if the profile changed."));
    } finally { setBusy(""); }
  };
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Marketplace quality" title="Vendor approvals" description="Review business listing content before publication. Listing approval does not certify identity or service quality." />
    <form className="grid gap-4 rounded-2xl bg-sand p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]" onSubmit={event => {
      event.preventDefault();
      setSearch(searchInput.trim());
      setPage(1);
    }}>
      <label className="block min-w-0"><span className="label">Search vendor listings</span><input className="field !bg-white" maxLength={160} disabled={Boolean(busy)} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Business, service or city" /></label>
      <label className="block">
        <span className="label">Approval status</span>
        <select className="field !bg-white" disabled={Boolean(busy)} value={status} onChange={event => {
          setStatus(event.target.value);
          setPage(1);
        }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label className="block"><span className="label">Listing access</span><select className="field !bg-white" value={suspended} disabled={Boolean(busy)} onChange={event => { setSuspended(event.target.value); setPage(1); }}><option value="">All listings</option><option value="false">Not suspended</option><option value="true">Suspended</option></select></label>
      <Button className="self-end" type="submit" disabled={Boolean(busy)}>Search listings</Button>
    </form>
    <p className="text-sm leading-6 text-ink/65">Only approved listings with active vendor accounts appear publicly. Essential business information must be complete before approval.</p>
    <WorkspaceError message={!errorVendor ? error : ""} onRetry={load} />
    {loading ? <LoadingSkeleton /> : <>
      <div className="space-y-5">
        {vendors.length ? vendors.map(vendor => <Card as="article" key={vendor._id} className="min-w-0 overflow-hidden">
          <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-bold text-coral"><Store className="h-3.5 w-3.5" aria-hidden="true" />{vendor.serviceCategory}</p>
              <h2 className="mt-2 break-words font-editorial text-2xl font-normal leading-tight sm:text-3xl">
                {vendor.businessName}
              </h2>
              <p className="mt-3 flex items-start gap-1.5 text-sm leading-6 text-ink/65"><MapPin className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-words">{vendor.location}</span></p>
              {vendor.city && <p className="mt-1 text-xs text-ink/65">City: {vendor.city}</p>}
            </div>
            <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${vendor.verificationStatus === "approved" ? "bg-sage text-ink" : vendor.verificationStatus === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
              {vendor.verificationStatus}
            </span>
          </div>
          {(vendor.suspended || vendor.userId?.suspendedAt) && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Account suspended.</strong> This listing is hidden from public discovery.</p>}
          {vendor.userId?.accountStatus && vendor.userId.accountStatus !== "active" && <p className="mt-4 text-sm text-red-800">Owner account: {vendor.userId.accountStatus}. Listing approval cannot restore an inactive account.</p>}
          {vendor.profileCompletion && <p className="mt-4 text-sm text-ink/65">Required profile information: {vendor.profileCompletion.percent}% complete.{!vendor.profileCompletion.readyForReview && ` Missing: ${vendor.profileCompletion.missingFields.join(", ")}.`}</p>}
          <div className="mt-5 grid gap-4 rounded-2xl bg-sand/65 p-4 sm:grid-cols-2">
            <div><p className="text-xs text-ink/65">Starting price</p><p className="mt-1 font-extrabold tabular-nums">{formatCurrency(vendor.pricing || 0)}</p></div>
            <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-ink/65"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />Business owner</p><p className="mt-1 break-words text-sm font-bold">{vendor.userId?.name || "Unavailable"}</p><p className="mt-1 break-all text-xs leading-5 text-ink/65">{vendor.userId?.email || "No email"}</p></div>
          </div>
          <p className="mt-5 whitespace-pre-line break-words text-sm leading-7 text-ink/75">
            {vendor.description}
          </p>
          {vendor.serviceAreas?.length > 0 && <p className="mt-3 break-words text-sm text-ink/65"><strong>Service coverage: </strong>{vendor.serviceAreas.join(", ")}</p>}
          {(vendor.contactDetails?.email || vendor.contactDetails?.phone) && <p className="mt-3 break-words text-sm leading-6 text-ink/65"><strong>Shared business contacts: </strong>{[vendor.contactDetails.phone, vendor.contactDetails.email].filter(Boolean).join(" · ")}</p>}
          {vendor.servicesOffered?.length > 0 && <ul aria-label="Services offered" className="mt-4 flex flex-wrap gap-2">{vendor.servicesOffered.map((service, index) => <li key={`${service}-${index}`} className="max-w-full break-words rounded-xl bg-sand px-3 py-2 text-xs font-semibold leading-5">{service}</li>)}</ul>}
          {getVendorGallery(vendor).length ? <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2" aria-label="Business portfolio">
            {getVendorGallery(vendor).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0 snap-start rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral" aria-label={`Open portfolio photo ${index + 1} by ${vendor.businessName} in a new tab`}>
              <img src={url} alt={`Work by ${vendor.businessName}, photo ${index + 1}`} loading="lazy" width="192" height="144" className="h-36 w-48 rounded-2xl object-cover" />
            </a>)}
          </div> : <p className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-ink/15 p-4 text-sm text-ink/65"><ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />No business photos uploaded.</p>}
          {vendor.verificationRejectionReason && <p className="mt-4 break-words rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800"><strong>Rejection reason: </strong>{vendor.verificationRejectionReason}</p>}
          </div>
          <div className="border-t border-ink/10 bg-sand/30 p-5 sm:p-7">
          <label className="block">
            <span className="label">Review reason (required for rejection)</span>
            <textarea id={`review-reason-${vendor._id}`} className="field !bg-white" rows={2} placeholder="Give the vendor clear, helpful feedback" disabled={Boolean(busy)} aria-invalid={errorVendor === vendor._id && Boolean(error)} aria-describedby={errorVendor === vendor._id && error ? `vendor-error-${vendor._id}` : undefined} value={reasons[vendor._id] || ""} maxLength={1000} onChange={event => setReasons(current => ({
              ...current,
              [vendor._id]: event.target.value
            }))} />
          </label>
          {errorVendor === vendor._id && error && <div id={`vendor-error-${vendor._id}`} className="mt-4"><WorkspaceError message={error} onRetry={load} /></div>}
          <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
            {vendor.verificationStatus !== "approved" && <Button loading={busy === vendor._id} disabled={Boolean(busy) || vendor.profileCompletion?.readyForReview === false || Boolean(vendor.suspended || vendor.userId?.suspendedAt) || Boolean(vendor.userId?.accountStatus && vendor.userId.accountStatus !== "active")} onClick={() => review(vendor, true)}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Approve vendor</Button>}
            {vendor.verificationStatus !== "rejected" && <Button variant="outline" className="!text-red-800" disabled={Boolean(busy)} onClick={() => review(vendor, false)}>Reject vendor</Button>}
            <Button variant="outline" disabled={Boolean(busy) || Boolean(vendor.userId?.accountStatus && vendor.userId.accountStatus !== "active")} onClick={() => { setSuspensionVendor(vendor); setSuspensionReason(""); setSuspensionError(""); }}>{vendor.suspended || vendor.userId?.suspendedAt ? "Restore vendor account" : "Suspend vendor account"}</Button>
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => setHistoryVendor(vendor)}>View moderation history</Button>
          </div>
          </div>
        </Card>) : <EmptyState title={error ? "Vendors unavailable" : "No vendors to review"} description={error ? "Try again to load business profiles." : "Business profiles with this status will appear here."} />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} disabled={Boolean(busy)} />
    </>}
    <Dialog open={Boolean(suspensionVendor)} onClose={() => { if (!busy) setSuspensionVendor(null); }} title={suspensionVendor?.suspended || suspensionVendor?.userId?.suspendedAt ? "Restore vendor account?" : "Suspend vendor account?"} description={suspensionVendor?.businessName} footer={<><Button variant="outline" disabled={Boolean(busy)} onClick={() => setSuspensionVendor(null)}>Keep current access</Button><Button loading={Boolean(busy)} disabled={Boolean(busy)} onClick={changeSuspension}>Confirm {suspensionVendor?.suspended || suspensionVendor?.userId?.suspendedAt ? "restoration" : "suspension"}</Button></>}>
      <p className="text-sm leading-6 text-ink/65">Suspension hides this vendor from public discovery and revokes account sessions. Existing booking history remains available to authorized administrators.</p>
      <label className="mt-4 block"><span className="label">Moderation reason</span><textarea className="field" maxLength={1000} rows={3} value={suspensionReason} disabled={Boolean(busy)} onChange={event => setSuspensionReason(event.target.value)} /></label>
      <WorkspaceError message={suspensionError} />
    </Dialog>
    <Dialog open={Boolean(historyVendor)} onClose={() => setHistoryVendor(null)} title="Moderation history" description={historyVendor?.businessName}>
      {historyVendor && <ModerationHistory key={historyVendor._id} vendor={historyVendor} />}
    </Dialog>
  </div>;
}
