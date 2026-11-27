import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { WorkspaceError, WorkspaceHeader } from "../components/dashboard/WorkspacePageParts";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  createPaymentRefund,
  getAdminFinancials,
  resolvePaymentException,
} from "../services/adminService";
import { getApiError } from "../utils/apiError";

const money = paise => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR",
}).format(paise / 100);
const formatStatus = value => value.replaceAll("_", " ");

function parsePaise(value) {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [rupees, fraction = ""] = value.trim().split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export default function AdminFinancialsPage() {
  useDocumentTitle("Financial reporting");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refundForm, setRefundForm] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [resolutionForm, setResolutionForm] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setReport(await getAdminFinancials()); }
    catch (requestError) { setError(getApiError(requestError, "Unable to load financial reporting.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submitRefund = async event => {
    event.preventDefault();
    const amountPaise = parsePaise(refundAmount);
    if (!refundForm || !amountPaise || !refundReason.trim()) {
      setError("Enter a valid refund amount in INR and a reason.");
      return;
    }
    setBusy(refundForm._id);
    setError("");
    try {
      await createPaymentRefund(refundForm._id, amountPaise, refundReason.trim(), crypto.randomUUID());
      setRefundForm(null);
      setRefundAmount("");
      setRefundReason("");
      await load();
    } catch (requestError) { setError(getApiError(requestError, "Unable to create refund.")); }
    finally { setBusy(""); }
  };
  const submitResolution = async event => {
    event.preventDefault();
    if (!resolutionForm || !resolutionNote.trim()) {
      setError("Provide a reconciliation resolution note.");
      return;
    }
    setBusy(resolutionForm._id);
    setError("");
    try {
      await resolvePaymentException(resolutionForm._id, resolutionNote.trim());
      setResolutionForm(null);
      setResolutionNote("");
      await load();
    } catch (requestError) { setError(getApiError(requestError, "Unable to resolve this exception.")); }
    finally { setBusy(""); }
  };

  return <div className="space-y-6 sm:space-y-8">
    <WorkspaceHeader eyebrow="Planzo administration" title="Financial reporting" description="Payment, refund, commission and vendor-payable records. No vendor payouts are initiated from this dashboard." />
    <WorkspaceError message={error} onRetry={load} />
    {loading ? <LoadingSkeleton /> : !report ? <Card className="p-6">Financial reporting is unavailable.</Card> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {[
          ["Successful payments", report.counts.successfulPayments],
          ["Failed payments", report.counts.failedPayments],
          ["Pending payments", report.counts.pendingPayments],
          ["Refunds", report.counts.refunds],
          ["Gross captured", money(report.totals.grossCapturedPaise)],
          ["Refunded", money(report.totals.refundedPaise)],
          ["Platform revenue", money(report.totals.platformRevenuePaise)],
          ["Vendor payable", money(report.totals.vendorPayablePaise)],
        ].map(([title, value]) => <Card key={title} className="p-4 sm:p-5">
          <p className="text-xs font-semibold text-ink/65">{title}</p>
          <p className="mt-2 break-words text-xl font-bold tabular-nums">{value}</p>
        </Card>)}
      </div>
      <section aria-labelledby="reconciliation-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="reconciliation-heading" className="text-lg font-bold">Reconciliation exceptions ({report.counts.openReconciliationExceptions})</h2>
          <Button type="button" variant="outline" className="!px-3 !py-2 !text-xs" disabled={busy !== ""} onClick={load}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</Button>
        </div>
        {report.reconciliationExceptions.length === 0 ? <Card className="p-5 text-sm text-ink/65">No open reconciliation exceptions.</Card> : <div className="space-y-3">
          {report.reconciliationExceptions.map(exception => <Card key={exception._id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="flex items-center gap-2 text-sm font-bold"><ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />{formatStatus(exception.reason)}</p>
                <p className="mt-1 break-all text-xs text-ink/65">Booking {exception.bookingId || "unmatched"} · Payment {exception.paymentId || "unmatched"}</p>
              </div>
              <Button type="button" variant="outline" className="!px-3 !py-2 !text-xs" onClick={() => { setResolutionForm(exception); setResolutionNote(""); }}>Record resolution</Button>
            </div>
            {resolutionForm?._id === exception._id && <form className="mt-4 space-y-3" onSubmit={submitResolution}>
              <label className="block"><span className="label">Resolution note</span><textarea className="field min-h-20" maxLength={500} required value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} /></label>
              <div className="flex gap-2"><Button type="submit" disabled={Boolean(busy)} loading={busy === exception._id}>Resolve</Button><Button type="button" variant="ghost" onClick={() => setResolutionForm(null)}>Cancel</Button></div>
            </form>}
          </Card>)}
        </div>}
      </section>
      <section aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="mb-3 text-lg font-bold">Recent payment obligations</h2>
        <div className="space-y-3">
          {report.payments.map(payment => <Card key={payment._id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-bold capitalize">{formatStatus(payment.installment)} · {money(payment.amountPaise)}</p>
                <p className="mt-1 break-all text-xs text-ink/65">Booking {payment.bookingId} · {formatStatus(payment.status)} · Captured {money(payment.capturedAmountPaise)}</p>
              </div>
              {payment.capturedAmountPaise > payment.refundedAmountPaise &&
                <Button type="button" variant="outline" className="!px-3 !py-2 !text-xs" onClick={() => {
                  setRefundForm(payment); setRefundAmount(""); setRefundReason("");
                }}>Admin refund</Button>}
            </div>
            {refundForm?._id === payment._id && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitRefund}>
              <label className="block"><span className="label">Amount (INR)</span><input className="field" inputMode="decimal" pattern="^\d{1,9}(\.\d{1,2})?$" value={refundAmount} onChange={event => setRefundAmount(event.target.value)} required /></label>
              <label className="block"><span className="label">Admin reason</span><input className="field" maxLength={500} value={refundReason} onChange={event => setRefundReason(event.target.value)} required /></label>
              <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={Boolean(busy)} loading={busy === payment._id}>Submit refund</Button><Button type="button" variant="ghost" onClick={() => setRefundForm(null)}>Cancel</Button></div>
              <p className="text-xs leading-5 text-ink/65 sm:col-span-2">This sends a real refund request to the configured Razorpay test account. The server enforces the remaining captured balance and records the cancellation snapshot when present.</p>
            </form>}
          </Card>)}
          {report.payments.length === 0 && <Card className="p-5 text-sm text-ink/65">No payment records yet.</Card>}
        </div>
      </section>
      <section aria-labelledby="refunds-heading">
        <h2 id="refunds-heading" className="mb-3 text-lg font-bold">Recent refunds</h2>
        {report.refunds.length === 0 ? <Card className="p-5 text-sm text-ink/65">No refund records yet.</Card> : <div className="space-y-2">
          {report.refunds.map(refund => <Card key={refund._id} className="flex flex-wrap justify-between gap-2 p-4 text-xs">
            <span>{money(refund.amountPaise)} · Booking {refund.bookingId}</span><span className="capitalize">{formatStatus(refund.status)}</span>
          </Card>)}
        </div>}
      </section>
      <section aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="mb-3 text-lg font-bold">Immutable financial audit trail</h2>
        {report.transactions.length === 0 ? <Card className="p-5 text-sm text-ink/65">No financial transactions recorded.</Card> : <div className="space-y-2">
          {report.transactions.map(transaction => <Card key={transaction._id} className="p-4">
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="font-bold capitalize">{formatStatus(transaction.kind)}</span>
              <span className="tabular-nums">{money(transaction.amountPaise)}</span>
            </div>
            <p className="mt-1 break-all text-[11px] leading-5 text-ink/65">Booking {transaction.bookingId}{transaction.paymentId ? ` · Payment ${transaction.paymentId}` : ""}{transaction.refundId ? ` · Refund ${transaction.refundId}` : ""}</p>
            {transaction.note && <p className="mt-1 text-xs text-ink/65">{transaction.note}</p>}
          </Card>)}
        </div>}
      </section>
      <Card className="p-4 text-xs leading-5 text-ink/65">Vendor-payable balances remain held for reconciliation. Real payouts are disabled pending Razorpay capability and compliance review.</Card>
    </>}
  </div>;
}
