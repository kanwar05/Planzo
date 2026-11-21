import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useAuth } from "../context/AuthContext";
import { supportCategories, supportStatuses } from "../data/supportCases";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { createSupportCase, getBookingSupportCases } from "../services/supportService";
import { getApiError } from "../utils/apiError";
import { getDashboardPath } from "../utils/navigation";

export default function BookingSupportPage() {
  const { bookingId } = useParams(), { user } = useAuth();
  return <SupportForBooking key={`${user?._id}:${bookingId}`} bookingId={bookingId} user={user} />;
}
function SupportForBooking({ bookingId, user }) {
  useDocumentTitle("Booking support");
  const [cases, setCases] = useState([]), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [unresolved, setUnresolved] = useState(false);
  const [category, setCategory] = useState("vendor_unresponsive"), [subject, setSubject] = useState(""), [description, setDescription] = useState("");
  const lock = useRef(false), attempt = useRef(null), scope = useRef(null);
  useEffect(() => {
    const current = { active: true }; scope.current = current;
    setLoading(true); setError("");
    getBookingSupportCases(bookingId).then(rows => { if (current.active) setCases(rows || []); })
      .catch(err => { if (current.active) setError(getApiError(err, "Support cases could not be loaded.")); })
      .finally(() => { if (current.active) setLoading(false); });
    return () => { current.active = false; };
  }, [bookingId, retry]);
  const submit = async event => {
    event.preventDefault(); if (lock.current || user?.emailVerified !== true) return;
    const current = scope.current, retrying = Boolean(attempt.current);
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      attempt.current ||= { key: crypto.randomUUID(), body: { category, subject: subject.trim(), description: description.trim() } };
      setUnresolved(true);
      const result = await createSupportCase(bookingId, attempt.current.body, attempt.current.key);
      if (!current.active) return;
      setCases(rows => [result.case, ...rows.filter(row => row._id !== result.case._id)]);
      attempt.current = null; setUnresolved(false); setSubject(""); setDescription(""); setMessage("Support case opened. Both booking participants can follow its public updates.");
    } catch (err) {
      if (!current.active) return;
      if (!retrying && [400, 401, 403, 404, 409, 422, 429].includes(err.response?.status)) { attempt.current = null; setUnresolved(false); }
      setError(getApiError(err, "The case could not be confirmed. Retry the same request before opening another."));
    } finally { lock.current = false; if (current.active) setBusy(false); }
  };
  return <div className="mx-auto max-w-4xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-coral">Customer support</p><h1 className="mt-2 font-editorial text-4xl">Support for your booking</h1><p className="mt-3 text-sm leading-7 text-ink/65">Raise a booking concern and follow an auditable investigation. Support decisions do not change your commercial agreement automatically.</p></div><Button to={getDashboardPath(user?.role)} variant="outline">Back to bookings</Button></header>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-800"><p>{error}</p><Button variant="ghost" disabled={busy} onClick={() => setRetry(value => value + 1)}>Refresh support cases</Button></div>}
    {message && <p role="status" className="rounded-xl bg-sage p-4 text-sm leading-7">{message}</p>}
    {loading ? <LoadingSkeleton /> : <section aria-label="Existing support cases" className="space-y-3"><h2 className="font-editorial text-2xl">Your cases</h2>{cases.length ? cases.map(item => <article key={item._id} className="rounded-2xl border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="break-words font-bold">{item.subject}</h3><span className="rounded-full bg-sand px-3 py-1 text-xs font-bold">{supportStatuses[item.status] || item.status}</span></div><p className="mt-2 text-xs leading-6 text-ink/65">{supportCategories[item.category] || item.category}</p><Button to={`/support/cases/${item._id}`} variant="outline" className="mt-4">View case</Button></article>) : <EmptyState title="No support cases yet" description="Use the form below if you need help with this booking." />}</section>}
    <section className="rounded-2xl border bg-white p-5 sm:p-7"><h2 className="font-editorial text-2xl">Open a support case</h2><p className="mt-2 text-xs leading-6 text-ink/65">The booking customer, vendor and administrators can see this case and its evidence. Keep private passwords and payment card information out of your submission.</p>
      {user?.emailVerified !== true ? <p className="mt-5 rounded-xl bg-sand p-4 text-sm">Verify your email before opening a case. Existing case history remains available.</p> : <form onSubmit={submit} className="mt-5 space-y-4">
        {unresolved && !busy && <p role="status" className="rounded-xl bg-sand p-3 text-xs leading-6">Delivery is unconfirmed. Retry this exact case before changing its contents; the same key will not open a duplicate.</p>}
        <fieldset disabled={busy || unresolved || loading} className="space-y-4">
          <label className="block"><span className="label">Concern category</span><select value={category} onChange={event => setCategory(event.target.value)} className="field">{Object.entries(supportCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="block"><span className="label">Case subject</span><input required maxLength={160} value={subject} onChange={event => setSubject(event.target.value)} className="field" /></label>
          <label className="block"><span className="label">Describe the concern</span><textarea required rows={5} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} className="field" /></label>
        </fieldset>
        <p className="text-xs leading-6 text-ink/65">Opening a case does not initiate a payment, cancellation fee, refund or payout.</p>
        <Button type="submit" loading={busy} disabled={loading}>Open support case</Button>
      </form>}
    </section>
  </div>;
}
