import { useCallback, useEffect, useRef, useState } from "react";
import Button from "./Button";
import PackageDetails from "./PackageDetails";
import QuotationDetails from "./QuotationDetails";
import QuotationEditor from "./QuotationEditor";
import { acceptQuotation, getQuotations, rejectQuotation } from "../services/quotationService";
import { getApiError } from "../utils/apiError";

export default function BookingQuotations({ booking, role = "customer", verified = true, disabled = false, onBookingChange }) {
  const [current, setCurrent] = useState(booking), [open, setOpen] = useState(false), [editing, setEditing] = useState(false);
  const [quotes, setQuotes] = useState([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => { setCurrent(booking); }, [booking]);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError("");
    try { const result = await getQuotations(booking._id); if (version === generation.current) setQuotes(result || []); }
    catch (err) { if (version === generation.current) setError(getApiError(err, "Unable to load quotations.")); }
    finally { if (version === generation.current) setLoading(false); }
  }, [booking._id]);
  useEffect(() => {
    if (open) load();
    return () => { generation.current += 1; };
  }, [open, load]);
  const latest = [...quotes].sort((a, b) => b.revision - a.revision)[0];
  const expired = latest && (!Number.isFinite(new Date(latest.expiresAt).getTime()) || new Date(latest.expiresAt).getTime() <= Date.now());
  const revisionLimit = Math.max(current.quotationRevision || 0, latest?.revision || 0) >= 100;
  const mayOffer = role === "vendor" && current.status === "pending" && verified && !revisionLimit;
  const mayRespond = role === "customer" && verified && current.status === "pending" && current.quotationStatus !== "rejected" && latest;
  const respond = async accept => {
    if (lock.current || disabled || !latest) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const next = accept ? await acceptQuotation(current._id, latest.revision) : await rejectQuotation(current._id, latest.revision);
      setCurrent(next); setMessage(accept ? "Quotation accepted. Your date is reserved and the agreement is saved." : "Quotation rejected. The booking remains pending for a revised offer or cancellation.");
      onBookingChange?.(next);
    } catch (err) { setError(getApiError(err, "Unable to update the quotation. Refresh history before trying again.")); }
    finally { lock.current = false; setBusy(false); }
  };
  const hasCommercial = Boolean(current.selectedPackage || current.quotationRevision || current.acceptedAgreement);
  if (role === "customer" && !hasCommercial) return null;
  if (role === "vendor" && !hasCommercial && current.status !== "pending") return null;
  if (role === "admin" && !hasCommercial) return null;
  return <section aria-label="Booking quotation" className="mt-5 space-y-4 border-t border-ink/10 pt-5">
    {current.acceptedAgreement && <QuotationDetails quotation={current.acceptedAgreement} accepted />}
    {current.selectedPackage && !current.acceptedAgreement && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-bold">Requested package: {current.selectedPackage.title}</summary><div className="mt-4"><PackageDetails item={current.selectedPackage} /></div></details>}
    {current.status === "pending" && current.selectedPackage && !current.quotationRevision && <p className="text-xs leading-6 text-ink/65">Awaiting a final vendor quotation. The package price is a guide, and no commercial amount has been accepted.</p>}
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || disabled || editing} onClick={() => setOpen(value => !value)}>{open ? "Hide quotation history" : role === "vendor" && current.status === "pending" ? "Manage quotation" : "Review quotations"}</Button>{open && <Button variant="ghost" disabled={busy || loading || editing} onClick={load}>Refresh quotation history</Button>}</div>
    {!verified && role !== "admin" && <p className="text-xs leading-6 text-ink/65">Verify your email to send or accept quotations.</p>}
    {open && <div className="space-y-4">
      {loading ? <p role="status" className="text-sm">Loading quotation history…</p> : <>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-sage p-3 text-sm leading-6">{message}</p>}
        {!quotes.length && !error && <p className="rounded-xl bg-sand p-4 text-sm">No quotation has been sent for this request yet.</p>}
        {latest && <>
          <QuotationDetails quotation={latest} />
          {expired && current.status === "pending" && <p role="status" className="text-sm text-red-800">This quotation has expired. Ask the vendor for a new revision.</p>}
          {current.quotationStatus === "rejected" && <p className="text-sm text-ink/65">The latest quotation was rejected. Its record remains in history.</p>}
          {mayRespond && <div className="space-y-3 rounded-xl bg-sand p-4"><p className="text-xs leading-6">Accepting agrees the exact listed price, scope and terms and reserves this vendor for your date.</p><div className="flex flex-wrap gap-3"><Button disabled={busy || disabled || expired} loading={busy} onClick={() => respond(true)}>Accept quotation and reserve date</Button><Button variant="outline" disabled={busy || disabled} onClick={() => respond(false)}>Reject quotation</Button></div></div>}
        </>}
        {mayOffer && !editing && <Button disabled={busy || disabled || Boolean(error)} onClick={() => setEditing(true)}>{latest ? "Create quotation revision" : "Create quotation"}</Button>}
        {role === "vendor" && revisionLimit && <p className="text-sm text-ink/65">This booking has reached its limit of 100 quotation revisions.</p>}
        {editing && <QuotationEditor booking={{ ...current, quotationRevision: latest?.revision || current.quotationRevision || 0 }} previous={latest} onClose={() => setEditing(false)} onSaved={result => {
          setQuotes(rows => [...rows.filter(row => row.revision !== result.quotation.revision), result.quotation]);
          if (result.booking) { setCurrent(result.booking); onBookingChange?.(result.booking); }
          setEditing(false); setMessage("Quotation sent. The customer must explicitly accept it to reserve the date.");
        }} />}
        {quotes.length > 1 && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-bold">Previous quotation revisions ({quotes.length - 1})</summary><div className="mt-4 space-y-4">{quotes.filter(row => row.revision !== latest.revision).sort((a, b) => b.revision - a.revision).map(row => <QuotationDetails key={row.revision} quotation={row} />)}</div></details>}
      </>}
    </div>}
  </section>;
}
