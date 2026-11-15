import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import { formatDate } from "../utils/format";

export default function BookingReasonDialog({ booking, status, onClose, onConfirm, busy = false, error = "" }) {
  const [reason, setReason] = useState("");
  const submitting = useRef(false);
  const formId = useId();
  const rejecting = status === "rejected";
  useEffect(() => { setReason(""); submitting.current = false; }, [booking?._id, status]);
  return <Dialog open={Boolean(booking)} onClose={() => { if (!busy && !submitting.current) onClose(); }} title={rejecting ? "Reject this request?" : "Cancel this booking?"} description="Share a short reason with the booking participants. Do not include private contact details." footer={<><Button variant="outline" disabled={busy} onClick={onClose}>{rejecting ? "Keep request" : "Keep booking"}</Button><Button type="submit" form={formId} disabled={busy || reason.trim().length > 1000} loading={busy}>{rejecting ? "Confirm rejection" : "Confirm cancellation"}</Button></>}>
    {booking && <div className="rounded-xl bg-sand p-4 text-sm leading-7"><p className="font-bold">{booking.vendorId?.businessName || booking.customerId?.name || "Event booking"}</p><p>{booking.eventType} · {formatDate(booking.eventDate)}</p><p className="break-words text-ink/65">{booking.eventLocation}</p></div>}
    <form id={formId} className="mt-5" onSubmit={async event => {
      event.preventDefault();
      if (busy || submitting.current || reason.trim().length > 1000) return;
      submitting.current = true;
      try { await onConfirm(reason.trim() || undefined); }
      finally { submitting.current = false; }
    }}>
      <label className="block"><span className="label">{rejecting ? "Rejection reason (optional)" : "Cancellation reason (optional)"}</span><textarea rows={3} maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} className="field resize-y" /></label>
      <p className="mt-2 text-xs text-ink/65">Up to 1,000 characters.</p>
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-red-800">{error}</p>}
    </form>
  </Dialog>;
}
