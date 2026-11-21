import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import { formatDate } from "../utils/format";
import CancellationPolicyDetails, { CancellationPolicyCutoffs } from "./CancellationPolicyDetails";
import { getBookingCancellationPolicy } from "../services/cancellationPolicyService";
import { getApiError } from "../utils/apiError";

export default function BookingReasonDialog({ booking, status, onClose, onConfirm, busy = false, error = "", role = "customer" }) {
  const [reason, setReason] = useState("");
  const [policyData, setPolicyData] = useState(null), [policyError, setPolicyError] = useState(""), [loadingPolicy, setLoadingPolicy] = useState(false), [override, setOverride] = useState(false), [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const formId = useId();
  const rejecting = status === "rejected";
  useEffect(() => { setReason(""); setOverride(false); submitting.current = false; }, [booking?._id, status]);
  useEffect(() => {
    setPolicyData(null); setPolicyError("");
    if (!booking || rejecting || !/^[a-f0-9]{24}$/i.test(booking._id)) { setLoadingPolicy(false); return; }
    let active = true; setLoadingPolicy(true);
    getBookingCancellationPolicy(booking._id).then(data => { if (active) setPolicyData(data); })
      .catch(err => { if (active) setPolicyError(getApiError(err, "Cancellation eligibility could not be checked.")); })
      .finally(() => { if (active) setLoadingPolicy(false); });
    return () => { active = false; };
  }, [booking?._id, rejecting, retry]);
  const eligibility = policyData?.eligibility;
  const required = !rejecting && (role === "vendor" || override);
  const blocked = !rejecting && (role === "admin"
    ? eligibility?.adminCanCancel === false || (eligibility?.adminOverrideRequired && !override)
    : eligibility?.[role === "vendor" ? "vendorCanCancel" : "customerCanCancel"] === false);
  const invalid = reason.trim().length > 1000 || (required && !reason.trim()) || blocked || loadingPolicy || Boolean(policyError);
  return <Dialog open={Boolean(booking)} onClose={() => { if (!busy && !submitting.current) onClose(); }} title={rejecting ? "Reject this request?" : "Cancel this booking?"} description="Share a short reason with the booking participants. Do not include private contact details." footer={<><Button variant="outline" disabled={busy} onClick={onClose}>{rejecting ? "Keep request" : "Keep booking"}</Button><Button type="submit" form={formId} disabled={busy || invalid} loading={busy}>{rejecting ? "Confirm rejection" : "Confirm cancellation"}</Button></>}>
    {booking && <div className="rounded-xl bg-sand p-4 text-sm leading-7"><p className="font-bold">{booking.vendorId?.businessName || booking.customerId?.name || "Event booking"}</p><p>{booking.eventType} · {formatDate(booking.eventDate)}</p><p className="break-words text-ink/65">{booking.eventLocation}</p></div>}
    <form id={formId} className="mt-5" onSubmit={async event => {
      event.preventDefault();
      if (busy || submitting.current || invalid) return;
      submitting.current = true;
      try { await onConfirm(reason.trim() || undefined, ...(override ? [{ overridePolicy: true }] : [])); }
      finally { submitting.current = false; }
    }}>
      {!rejecting && <div className="mb-4 space-y-3">{loadingPolicy ? <p role="status" className="text-xs">Checking cancellation eligibility…</p> : policyError ? <div role="alert" className="text-xs text-red-800"><p>{policyError}</p><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry eligibility check</Button></div> : <CancellationPolicyDetails policy={policyData?.policy || booking?.acceptedAgreement?.cancellationPolicy} legacy={policyData?.source === "legacy"} />}
        {!loadingPolicy && !policyError && <CancellationPolicyCutoffs policy={policyData?.policy} eligibility={eligibility} />}
        {blocked && <p role="alert" className="text-xs leading-6 text-red-800">{role === "admin" ? "A recorded policy override is required to cancel after the cutoff." : eligibility?.[role === "vendor" ? "vendorReason" : "customerReason"] || "This booking is outside its cancellation cutoff. Open a support case for assistance."}</p>}
        {role === "admin" && <label className="flex items-start gap-3 text-xs leading-6"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} disabled={busy} className="mt-1" /><span>Override the policy cutoff with an audited reason</span></label>}
      </div>}
      <label className="block"><span className="label">{rejecting ? "Rejection reason (optional)" : required ? "Cancellation reason (required)" : "Cancellation reason (optional)"}</span><textarea rows={3} maxLength={1000} required={required} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="field resize-y" /></label>
      <p className="mt-2 text-xs text-ink/65">Up to 1,000 characters.</p>
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-red-800">{error}</p>}
    </form>
  </Dialog>;
}
