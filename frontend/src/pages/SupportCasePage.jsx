import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import LoadingSkeleton from "../components/LoadingSkeleton";
import QuotationDetails from "../components/QuotationDetails";
import ConversationBookingSummary from "../components/ConversationBookingSummary";
import SupportEvidence from "../components/SupportEvidence";
import { useAuth } from "../context/AuthContext";
import { supportCategories, supportStatuses, supportTransitions, eventLabels } from "../data/supportCases";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { addPrivateSupportNote, addSupportUpdate, getSupportCase, getSupportEvents, manageSupportCase } from "../services/supportService";
import { getApiError } from "../utils/apiError";
import { messageTime } from "../utils/messages";

const mergeEvents = (current, incoming) => [...new Map([...current, ...incoming].map(event => [event._id || event.sequence, event])).values()].sort((a, b) => a.sequence - b.sequence);
export default function SupportCasePage() {
  const { caseId } = useParams(), { user } = useAuth();
  return <CaseDetail key={`${user?._id}:${caseId}`} caseId={caseId} user={user} />;
}
function CaseDetail({ caseId, user }) {
  useDocumentTitle("Support case");
  const [record, setRecord] = useState(null), [booking, setBooking] = useState(null), [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState(""), [retry, setRetry] = useState(0);
  const [before, setBefore] = useState(null), [olderBusy, setOlderBusy] = useState(false), [busy, setBusy] = useState("");
  const [update, setUpdate] = useState(""), [note, setNote] = useState(""), [status, setStatus] = useState(""), [reason, setReason] = useState(""), [resolution, setResolution] = useState(""), [assignee, setAssignee] = useState("");
  const lock = useRef(false), scope = useRef(null);
  const admin = user?.role === "admin";
  useEffect(() => {
    const current = { active: true }; scope.current = current;
    setLoading(true); setError("");
    Promise.all([getSupportCase(caseId), getSupportEvents(caseId, { limit: 50 })]).then(([details, history]) => {
      if (!current.active) return;
      setRecord(details.case); setBooking(details.booking); setEvents(history.events || []);
      setBefore(history.pagination?.hasMore ? history.pagination.nextBefore : null);
      setAssignee(details.case.assignedAdminId || ""); setStatus("");
    }).catch(err => { if (current.active) {
      if ([401, 403, 404].includes(err.response?.status)) { setRecord(null); setBooking(null); setEvents([]); setNote(""); }
      setError(getApiError(err, "This support case could not be loaded."));
    } })
      .finally(() => { if (current.active) setLoading(false); });
    return () => { current.active = false; };
  }, [caseId, retry]);
  const perform = async (kind, action) => {
    if (lock.current) throw new Error("Another case update is still pending.");
    const current = scope.current;
    lock.current = true; setBusy(kind); setError(""); setMessage("");
    try {
      const result = await action();
      if (current.active) {
        if (result.case) setRecord(result.case);
        if (result.event) setEvents(rows => mergeEvents(rows, [result.event]));
        setMessage(kind === "note" ? "Private administrator note saved." : kind === "evidence" ? "Evidence saved." : "Support case updated.");
      }
      return result;
    } catch (err) { if (current.active) {
      if ([401, 403].includes(err.response?.status)) { setRecord(null); setBooking(null); setEvents([]); setNote(""); }
      setError(getApiError(err, "The case could not be updated. Refresh to check its latest revision before trying again."));
    } throw err; }
    finally { lock.current = false; if (current.active) setBusy(""); }
  };
  const earlier = async () => {
    if (olderBusy || !before) return;
    const current = scope.current; setOlderBusy(true); setError("");
    try {
      const result = await getSupportEvents(caseId, { before, limit: 50 });
      if (current.active) { setEvents(rows => mergeEvents(rows, result.events || [])); setBefore(result.pagination?.hasMore ? result.pagination.nextBefore : null); }
    } catch (err) { if (current.active) setError(getApiError(err, "Earlier case updates could not be loaded.")); }
    finally { if (current.active) setOlderBusy(false); }
  };
  const publicUpdate = async event => {
    event.preventDefault(); if (!update.trim() || !record) return;
    try { await perform("update", () => addSupportUpdate(caseId, { revision: record.revision, body: update.trim() })); setUpdate(""); } catch { /* Keep the text and show the shared recoverable error. */ }
  };
  const saveNote = async event => {
    event.preventDefault(); if (!note.trim() || !record) return;
    try { await perform("note", () => addPrivateSupportNote(caseId, { revision: record.revision, body: note.trim() })); setNote(""); } catch { /* Keep private text local until saved. */ }
  };
  const assign = async value => {
    if (!record) return;
    try { await perform("assign", () => manageSupportCase(caseId, { revision: record.revision, assignedAdminId: value })); setAssignee(value || ""); } catch { /* Revision must be refreshed after a conflict. */ }
  };
  const changeStatus = async event => {
    event.preventDefault(); if (!record || !status) return;
    const reopening = status === "investigating" && ["resolved", "closed"].includes(record.status);
    if ((status === "resolved" && !resolution.trim()) || (reopening && !reason.trim())) return;
    try {
      await perform("status", () => manageSupportCase(caseId, { revision: record.revision, status,
        ...(reason.trim() ? { reason: reason.trim() } : {}), ...(status === "resolved" ? { resolution: resolution.trim() } : {}) }));
      setStatus(""); setReason(""); setResolution("");
    } catch { /* No booking or financial action is implied by this failure. */ }
  };
  if (loading) return <div><h1 className="mb-5 font-editorial text-4xl">Support case</h1><LoadingSkeleton /></div>;
  if (!record) return <div className="space-y-4"><h1 className="font-editorial text-4xl">Support case</h1><p role="alert" className="text-sm text-red-800">{error || "This case is unavailable."}</p><Button onClick={() => setRetry(value => value + 1)}>Try again</Button></div>;
  const canWrite = (admin || user?.emailVerified === true) && record.status !== "closed";
  const visibleEvents = events.filter(event => admin || (event.visibility !== "admin" && event.kind !== "private_note"));
  const reopening = status === "investigating" && ["resolved", "closed"].includes(record.status);
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-coral">Booking support</p><h1 className="mt-2 break-words font-editorial text-3xl sm:text-4xl">{record.subject}</h1><p className="mt-3 text-xs leading-6 text-ink/65">{supportCategories[record.category] || record.category} · {supportStatuses[record.status] || record.status} · Revision {record.revision}</p></div><div className="flex flex-wrap gap-3"><Button to={admin ? "/admin/support" : `/bookings/${record.bookingId}/support`} variant="outline">Back to cases</Button><Button variant="ghost" disabled={Boolean(busy)} onClick={() => setRetry(value => value + 1)}>Refresh case</Button></div></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-sage p-4 text-sm leading-7">{message}</p>}
    <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="text-sm font-bold">Reported concern</h2><p className="whitespace-pre-line break-words text-sm leading-7">{record.description}</p><p className="text-xs text-ink/65">{record.assigned ? "Assigned to support" : "Awaiting administrator assignment"}</p>{record.resolution && <div className="rounded-xl bg-sage/50 p-4"><h3 className="text-sm font-bold">Recorded resolution</h3><p className="mt-2 whitespace-pre-line break-words text-sm leading-7">{record.resolution}</p></div>}<p className="text-xs leading-6 text-ink/65">Support outcomes do not themselves cancel bookings, change commercial agreements or execute payments/refunds.</p></section>
    {booking && <ConversationBookingSummary booking={booking} />}
    {record.agreementSnapshot && <details className="rounded-2xl border bg-white p-4"><summary className="cursor-pointer text-sm font-bold">Agreement when this case was opened</summary><div className="mt-4"><QuotationDetails quotation={record.agreementSnapshot} accepted /></div></details>}
    {admin && <section aria-label="Admin case management" className="space-y-6 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="font-editorial text-2xl">Investigation management</h2>
      <form onSubmit={event => { event.preventDefault(); if (/^[a-f0-9]{24}$/i.test(assignee)) assign(assignee); }} className="space-y-3"><label className="block"><span className="label">Assigned administrator ID</span><input value={assignee} onChange={event => setAssignee(event.target.value)} pattern="[a-fA-F0-9]{24}" maxLength={24} className="field" disabled={Boolean(busy)} /></label><div className="flex flex-wrap gap-3"><Button type="submit" variant="outline" disabled={Boolean(busy) || !/^[a-f0-9]{24}$/i.test(assignee)}>Assign administrator</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => assign(user._id)}>Assign to me</Button><Button variant="ghost" disabled={Boolean(busy) || !record.assigned} onClick={() => assign(null)}>Unassign case</Button></div></form>
      <form onSubmit={changeStatus} className="space-y-4 border-t pt-5"><label className="block"><span className="label">Next case status</span><select value={status} onChange={event => setStatus(event.target.value)} className="field" disabled={Boolean(busy)}><option value="">Choose a status</option>{(supportTransitions[record.status] || []).map(value => <option key={value} value={value}>{supportStatuses[value]}{value === "investigating" && ["closed", "resolved"].includes(record.status) ? " (reopen case)" : ""}</option>)}</select></label>
        {status === "resolved" && <label className="block"><span className="label">Resolution decision</span><textarea required rows={4} maxLength={4000} value={resolution} onChange={event => setResolution(event.target.value)} disabled={Boolean(busy)} className="field" /></label>}
        {status && <label className="block"><span className="label">{reopening ? "Reopening reason (required)" : "Status change reason (optional)"}</span><textarea required={reopening} rows={3} maxLength={4000} value={reason} onChange={event => setReason(event.target.value)} disabled={Boolean(busy)} className="field" /></label>}
        <p className="text-xs leading-6 text-ink/65">The decision and public reason are visible to both booking participants. Record internal deliberations in the private note form.</p><Button type="submit" disabled={Boolean(busy) || !status || (status === "resolved" && !resolution.trim()) || (reopening && !reason.trim())}>Record case status</Button>
      </form>
    </section>}
    <section aria-label="Support case timeline" className="space-y-4 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="font-editorial text-2xl">Case timeline</h2>{before && <Button variant="outline" loading={olderBusy} onClick={earlier}>Load earlier updates</Button>}
      {visibleEvents.length ? <ol className="space-y-4">{visibleEvents.map(event => <li key={event._id || event.sequence} className={`rounded-xl border p-4 ${event.kind === "private_note" ? "border-plum/20 bg-plum/5" : "bg-sand/40"}`}><p className="text-xs font-bold">{eventLabels[event.kind] || "Case update"} · {event.actorRole || "Support"}</p><p className="mt-1 text-[11px] text-ink/65">{messageTime(event.createdAt)}</p>{event.body && <p className="mt-3 whitespace-pre-line break-words text-sm leading-7">{event.body}</p>}{event.status && <p className="mt-2 text-xs">Status: {supportStatuses[event.status] || event.status}</p>}</li>)}</ol> : <p className="text-sm text-ink/65">No case updates yet.</p>}
      {canWrite ? <form onSubmit={publicUpdate} className="space-y-3 border-t pt-5"><label className="block"><span className="label">Public case update</span><textarea required maxLength={4000} rows={4} value={update} onChange={event => setUpdate(event.target.value)} disabled={Boolean(busy)} className="field" /></label><p className="text-xs leading-6 text-ink/65">Visible to the customer, vendor and administrators.</p><Button type="submit" disabled={Boolean(busy) || !update.trim()}>Post public update</Button></form> : <p className="rounded-xl bg-sand p-3 text-xs leading-6">{record.status === "closed" ? "This case is closed. An administrator must record a reason to reopen it before more public updates or evidence can be added." : "Verify your email to add public updates or evidence."}</p>}
    </section>
    <SupportEvidence caseId={caseId} record={record} canUpload={canWrite} busy={busy} perform={perform} />
    {admin && <section aria-label="Private administrator notes" className="rounded-2xl border border-plum/20 bg-white p-5 sm:p-7"><h2 className="font-editorial text-2xl">Private administrator notes</h2><p className="mt-2 text-xs leading-6 text-ink/65">Only administrators can see these notes. They are not shared with participants or included in emails.</p><form onSubmit={saveNote} className="mt-4 space-y-3"><label className="block"><span className="label">Private administrator note</span><textarea required rows={4} maxLength={4000} value={note} onChange={event => setNote(event.target.value)} disabled={Boolean(busy)} className="field" /></label><Button type="submit" variant="dark" disabled={Boolean(busy) || !note.trim()}>Save private note</Button></form></section>}
  </div>;
}
