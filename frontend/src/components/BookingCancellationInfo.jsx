import { useEffect, useState } from "react";
import Button from "./Button";
import CancellationPolicyDetails, { CancellationPolicyCutoffs } from "./CancellationPolicyDetails";
import { getBookingCancellationPolicy } from "../services/cancellationPolicyService";
import { getApiError } from "../utils/apiError";

export default function BookingCancellationInfo({ booking }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !/^[a-f0-9]{24}$/i.test(booking._id)) return;
    let active = true; setLoading(true); setError("");
    getBookingCancellationPolicy(booking._id).then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(getApiError(err, "Cancellation information could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, booking._id, booking.status, retry]);
  const cancellation = booking.cancellation;
  return <div className="mt-4 space-y-3">
    <Button variant="ghost" className="!px-0 !text-xs" onClick={() => setOpen(value => !value)}>{open ? "Hide cancellation information" : "View cancellation policy"}</Button>
    {cancellation && <p className="text-xs leading-6 text-ink/65">Cancelled by {cancellation.cancelledByRole || "a booking participant"}{cancellation.cancelledAt ? ` on ${new Date(cancellation.cancelledAt).toLocaleString("en-IN", { timeZone: "UTC" })} UTC` : ""}.{cancellation.overridePolicy && " Administrator policy override recorded."}</p>}
    {open && (loading ? <p role="status" className="text-xs">Loading cancellation policy…</p> : error ? <div role="alert" className="text-xs text-red-800"><p>{error}</p><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry cancellation information</Button></div> : <><CancellationPolicyDetails policy={data?.policy || booking.acceptedAgreement?.cancellationPolicy} legacy={data?.source === "legacy"} /><CancellationPolicyCutoffs policy={data?.policy} eligibility={data?.eligibility} /></>)}
  </div>;
}
