import { useCallback, useEffect, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Pagination from "../components/Pagination";
import Toast from "../components/Toast";
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
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminVendors({
        status,
        page,
        limit: 8
      });
      setVendors(data.vendors || []);
      setPagination(data.pagination || {});
    } catch (err) {
      setError(getApiError(err, "Unable to load vendors."));
    } finally {
      setLoading(false);
    }
  }, [status, page]);
  useEffect(() => {
    load();
  }, [load]);
  const review = async (id, approved) => {
    if (!approved && !reasons[id]?.trim()) {
      setError("Provide a reason so the vendor can improve their profile.");
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
  return <div className="space-y-7">
    <Toast message={message} onClose={() => setMessage("")} />
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-coral">Marketplace quality</p>
      <h1 className="mt-2 text-3xl font-extrabold">Vendor approvals</h1>
      <p className="mt-3 text-sm text-ink/55">Only approved vendors appear in the public marketplace.</p>
    </header>
    <label className="block max-w-xs">
      <span className="label">Approval status</span>
      <select className="field" value={status} onChange={event => {
        setStatus(event.target.value);
        setPage(1);
      }}>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
    </label>
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {error}
    </p>}
    {loading ? <LoadingSkeleton /> : <>
      <div className="space-y-5">
        {vendors.length ? vendors.map(vendor => <article key={vendor._id} className="rounded-3xl border bg-white p-6 shadow-soft">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold">
                {vendor.businessName}
              </h2>
              <p className="mt-2 text-sm text-ink/55">{vendor.serviceCategory} · {vendor.location} · {formatCurrency(vendor.pricing || 0)}</p>
              <p className="mt-2 break-all text-xs text-ink/50">Owner: {vendor.userId?.name || "Unavailable"} ({vendor.userId?.email || "No email"})</p>
            </div>
            <span className="text-xs font-bold capitalize text-coral">
              {vendor.verificationStatus}
            </span>
          </div>
          <p className="mt-5 whitespace-pre-line text-sm leading-7 text-ink/65">
            {vendor.description}
          </p>
          {vendor.servicesOffered?.length > 0 && <p className="mt-3 text-sm text-ink/55">Services: {vendor.servicesOffered.join(", ")}</p>}
          <div className="mt-5 flex gap-3 overflow-x-auto">
            {getVendorGallery(vendor).map(url => <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={`Work by ${vendor.businessName}`} className="h-28 w-40 max-w-none rounded-2xl object-cover" />
            </a>)}
          </div>
          {vendor.verificationRejectionReason && <p className="mt-4 text-sm text-red-700">Rejection reason: {vendor.verificationRejectionReason}</p>}
          <label className="mt-5 block">
            <span className="label">Review reason (required for rejection)</span>
            <textarea className="field" rows={2} value={reasons[vendor._id] || ""} maxLength={1000} onChange={event => setReasons(current => ({
              ...current,
              [vendor._id]: event.target.value
            }))} />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            {vendor.verificationStatus !== "approved" && <Button loading={busy === vendor._id} disabled={Boolean(busy)} onClick={() => review(vendor._id, true)}>Approve vendor</Button>}
            {vendor.verificationStatus !== "rejected" && <Button variant="outline" disabled={Boolean(busy)} onClick={() => review(vendor._id, false)}>Reject vendor</Button>}
          </div>
        </article>) : <EmptyState title="No vendors to review" description="Business profiles with this status will appear here." />}
      </div>
      <Pagination pagination={pagination} page={page} onPage={setPage} />
    </>}
  </div>;
}
