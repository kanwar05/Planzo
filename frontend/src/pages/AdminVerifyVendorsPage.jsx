import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, MapPin, ShieldCheck, Store, UserRound } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getAdminVendors, reviewVendor } from "../services/adminService";
import { getApiError } from "../utils/apiError";
import { formatCurrency } from "../utils/format";
import { getVendorGallery } from "../utils/vendor";
export default function AdminVerifyVendorsPage() {
  useDocumentTitle("Vendor approvals");
  const [vendors, setVendors] = useState([]);
  const [status, setStatus] = useState("pending");
  const [reasons, setReasons] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorVendor, setErrorVendor] = useState("");
  const [message, setMessage] = useState("");
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    setErrorVendor("");
    try {
      const data = await getAdminVendors({
        status,
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
  }, [status, page]);
  useEffect(() => {
    load();
    return () => { loadVersion.current += 1; };
  }, [load]);
  const review = async (id, approved) => {
    if (busy) return;
    setErrorVendor(id);
    if (!approved && !reasons[id]?.trim()) {
      setError("Provide a reason so the vendor can improve their profile.");
      document.getElementById(`review-reason-${id}`)?.focus();
      return;
    }
    setBusy(id);
    setError("");
    try {
      await reviewVendor(id, approved, reasons[id]?.trim());
      await load();
      setMessage(approved ? "Vendor approved." : "Vendor rejected.");
    } catch (err) {
      setError(getApiError(err, "Unable to review vendor."));
    } finally {
      setBusy("");
    }
  };
  return <div className="space-y-6 sm:space-y-8">
    <Toast message={message} onClose={() => setMessage("")} />
    <WorkspaceHeader eyebrow="Marketplace quality" title="Vendor approvals" description="A thoughtful first impression starts with a trusted business. Review profiles before they join the marketplace." />
    <div className="flex flex-col gap-4 rounded-2xl bg-sand p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-coral" aria-hidden="true" /><div><p className="font-bold">Profile review</p><p className="mt-1 text-sm leading-6 text-ink/65">Only approved vendors appear in the public marketplace.</p></div></div>
      <label className="block w-full sm:w-52">
        <span className="label">Approval status</span>
        <select className="field !bg-white" disabled={Boolean(busy)} value={status} onChange={event => {
          setStatus(event.target.value);
          setPage(1);
        }}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
    </div>
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
            </div>
            <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${vendor.verificationStatus === "approved" ? "bg-sage text-ink" : vendor.verificationStatus === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
              {vendor.verificationStatus}
            </span>
          </div>
          <div className="mt-5 grid gap-4 rounded-2xl bg-sand/65 p-4 sm:grid-cols-2">
            <div><p className="text-xs text-ink/65">Starting price</p><p className="mt-1 font-extrabold tabular-nums">{formatCurrency(vendor.pricing || 0)}</p></div>
            <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-ink/65"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />Business owner</p><p className="mt-1 break-words text-sm font-bold">{vendor.userId?.name || "Unavailable"}</p><p className="mt-1 break-all text-xs leading-5 text-ink/65">{vendor.userId?.email || "No email"}</p></div>
          </div>
          <p className="mt-5 whitespace-pre-line break-words text-sm leading-7 text-ink/75">
            {vendor.description}
          </p>
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
          {errorVendor === vendor._id && error && <div id={`vendor-error-${vendor._id}`} className="mt-4"><WorkspaceError message={error} /></div>}
          <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
            {vendor.verificationStatus !== "approved" && <Button loading={busy === vendor._id} disabled={Boolean(busy)} onClick={() => review(vendor._id, true)}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Approve vendor</Button>}
            {vendor.verificationStatus !== "rejected" && <Button variant="outline" className="!text-red-800" disabled={Boolean(busy)} onClick={() => review(vendor._id, false)}>Reject vendor</Button>}
          </div>
          </div>
        </Card>) : <EmptyState title={error ? "Vendors unavailable" : "No vendors to review"} description={error ? "Try again to load business profiles." : "Business profiles with this status will appear here."} />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} disabled={Boolean(busy)} />
    </>}
  </div>;
}
