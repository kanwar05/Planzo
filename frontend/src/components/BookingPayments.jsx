import { useCallback, useEffect, useState } from "react";
import { Download, LockKeyhole, RefreshCw } from "lucide-react";
import Button from "./Button";
import Card from "./Card";
import {
  createPaymentOrder,
  downloadPaymentDocument,
  getBookingPaymentHistory,
  verifyPayment,
} from "../services/paymentService";
import { getApiError } from "../utils/apiError";

let checkoutScriptPromise;
function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error("Razorpay Checkout did not initialize."));
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout."));
    document.head.appendChild(script);
  }).catch(error => {
    checkoutScriptPromise = null;
    throw error;
  });
  return checkoutScriptPromise;
}

const money = paise => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR",
}).format(paise / 100);
const terminal = new Set(["captured", "partially_refunded", "refunded"]);
const label = value => value.replaceAll("_", " ");

export default function BookingPayments({ booking, verified = true }) {
  const [history, setHistory] = useState({ payments: [], refunds: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setHistory(await getBookingPaymentHistory(booking._id));
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to load payment history."));
    } finally {
      setLoading(false);
    }
  }, [booking._id]);
  useEffect(() => { load(); }, [load]);

  const download = async (path, filename) => {
    setError("");
    try { await downloadPaymentDocument(path, filename); }
    catch (requestError) { setError(getApiError(requestError, "Unable to download this document.")); }
  };
  const pay = async installment => {
    if (busy) return;
    setBusy(installment);
    setError("");
    setMessage("");
    try {
      const { payment, checkout } = await createPaymentOrder(
        booking._id, installment, crypto.randomUUID(),
      );
      if (!checkout?.orderId || !checkout?.keyId) throw new Error("Payment order details are unavailable.");
      await loadRazorpayCheckout();
      const checkoutWindow = new window.Razorpay({
        key: checkout.keyId,
        amount: payment.amountPaise,
        currency: checkout.currency,
        order_id: checkout.orderId,
        name: "Planzo",
        description: installment === "deposit" ? "Booking deposit" : "Remaining booking balance",
        handler: async response => {
          setBusy(installment);
          try {
            const result = await verifyPayment(response);
            setMessage(result.message);
          } catch (requestError) {
            setError(getApiError(requestError, "Payment verification is still pending. Check payment history shortly."));
          } finally {
            setBusy("");
            await load();
          }
        },
        modal: { ondismiss: () => { setBusy(""); load(); } },
        theme: { color: "#b5673e" },
      });
      checkoutWindow.open();
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to start secure checkout."));
      setBusy("");
      await load();
    }
  };

  const payments = history.payments || [];
  const deposit = payments.find(payment => payment.installment === "deposit");
  const balance = payments.find(payment => payment.installment === "balance");
  const agreement = booking.acceptedAgreement;
  const canPayDeposit = !deposit || !terminal.has(deposit.status);
  const canPayBalance = deposit?.status === "captured" &&
    agreement?.totalAmount > deposit.amountPaise &&
    (!balance || !terminal.has(balance.status));

  if (booking.status !== "accepted" || !agreement) return null;
  return <Card as="section" aria-label="Booking payments" className="mt-5 !rounded-2xl !shadow-none">
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Payments</h3>
          <p className="mt-1 text-xs leading-5 text-ink/65">Secure INR payments for your accepted quotation.</p>
        </div>
        <Button type="button" variant="outline" className="!px-3 !py-2 !text-xs" disabled={busy !== ""} onClick={() => download(
          `/payments/bookings/${booking._id}/invoice`, `planzo-invoice-${booking._id}.pdf`,
        )}><Download className="h-4 w-4" aria-hidden="true" /> Invoice PDF</Button>
      </div>
      {!verified && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">Verify your email before starting a payment.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-sage/60 p-3 text-xs leading-5 text-ink">{message}</p>}
      {loading ? <p className="mt-4 text-xs text-ink/65">Loading payment history…</p> : <>
        {payments.length > 0 && <ul className="mt-4 divide-y divide-ink/10">
          {payments.map(payment => <li key={payment._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
            <span className="capitalize">{label(payment.installment)} · {money(payment.amountPaise)}</span>
            <span className="flex items-center gap-2 capitalize text-ink/65">{label(payment.status)}
              {payment.capturedAmountPaise > 0 && <button type="button" aria-label={`Download ${payment.installment} receipt`} className="inline-flex min-h-9 items-center gap-1 font-semibold text-coral" onClick={() => download(
                `/payments/${payment._id}/receipt`, `planzo-receipt-${payment._id}.pdf`,
              )}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Receipt</button>}
            </span>
          </li>)}
        </ul>}
        {history.refunds?.length > 0 && <div className="mt-3 border-t border-ink/10 pt-3">
          <p className="text-xs font-bold">Refunds</p>
          <ul className="mt-2 space-y-2">{history.refunds.map(refund => <li key={refund._id} className="flex justify-between gap-3 text-xs capitalize text-ink/65">
            <span>{money(refund.amountPaise)}</span><span>{label(refund.status)}</span>
          </li>)}</ul>
        </div>}
        {(canPayDeposit || canPayBalance) && <div className="mt-4 flex flex-wrap gap-2">
          {canPayDeposit && <Button type="button" variant="primary" disabled={!verified || Boolean(busy)} loading={busy === "deposit"} onClick={() => pay("deposit")}>
            {deposit ? "Retry deposit" : "Pay deposit"}
          </Button>}
          {canPayBalance && <Button type="button" variant="outline" disabled={!verified || Boolean(busy)} loading={busy === "balance"} onClick={() => pay("balance")}>
            Pay remaining balance
          </Button>}
        </div>}
        {deposit?.status === "captured" && !canPayBalance && agreement.totalAmount <= deposit.amountPaise &&
          <p className="mt-3 text-xs text-ink/65">The accepted amount has been paid.</p>}
      </>}
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-ink/55"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Planzo does not store card or bank details. Razorpay confirms payment status independently of this page.</p>
      <button type="button" onClick={load} disabled={loading || Boolean(busy)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-ink/65 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh payment history</button>
    </div>
  </Card>;
}
