import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PaymentTimeline from "../components/PaymentTimeline";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Toast from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import {
  createPaymentOrder,
  getBookingPayments,
  invoiceUrl,
  openRazorpay,
  verifyPayment,
} from "../services/paymentService";
import { formatCurrency } from "../utils/format";
import { getApiError } from "../utils/apiError";

export default function BookingPaymentPage() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState();
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState("");

  const load = async () => {
    try {
      setError("");
      const result = await getBookingPayments(bookingId);
      setData(result);
    } catch (e) {
      setError(getApiError(e, "Unable to load payments."));
    }
  };

  useEffect(() => {
    if (bookingId) {
      load();
    }
  }, [bookingId]);

  const pay = async (installmentType) => {
    if (paying) return;
    setPaying(true);
    setError("");
    setCheckoutStatus("Creating payment order...");
    try {
      const created = await createPaymentOrder(bookingId, installmentType);
      setCheckoutStatus("Opening secure checkout...");
      await openRazorpay({
        ...created,
        customer: user,
        onSuccess: async (payload) => {
          const result = await verifyPayment(bookingId, payload);
          navigate(
            result.payment.status === "captured"
              ? `/payments/success?booking=${bookingId}`
              : `/payments/success?booking=${bookingId}&pending=1`,
          );
        },
        onFailure: (e) =>
          setError(e.description || e.message || "Payment verification failed"),
      });
    } catch (e) {
      setError(getApiError(e, "Unable to start payment."));
    } finally {
      setPaying(false);
      setCheckoutStatus("");
      await load();
    }
  };
  if (!data)
    return (
      <div className="p-10">
        <p>Loading payment details...</p>
        <LoadingSkeleton />
      </div>
    );
  const rawBooking = data.booking || {};
  const totalAmount = Number(rawBooking.totalAmount ?? rawBooking.budget ?? 0);
  const totalPaidAmount = Number(rawBooking.totalPaidAmount ?? 0);
  const b = {
    ...rawBooking,
    paymentStatus: rawBooking.paymentStatus || "pending",
    totalAmount,
    totalPaidAmount,
    remainingAmount: Number(
      rawBooking.remainingAmount ?? Math.max(0, totalAmount - totalPaidAmount),
    ),
    refundAmount: Number(rawBooking.refundAmount ?? 0),
  };
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-black">Booking payments</h1>
      <p className="mt-2 text-ink/55">
        Three secure installments, calculated from the confirmed booking amount.
      </p>
      {error && <Toast type="error" message={error} />}
      {checkoutStatus && (
        <p className="mt-4 text-sm font-bold text-coral">{checkoutStatus}</p>
      )}
      <h2 className="mt-8 text-xl font-extrabold">Payment Summary</h2>
      <section className="my-8 grid gap-3 rounded-2xl bg-ink p-6 text-white sm:grid-cols-4">
        {[
          ["Total", b.totalAmount],
          ["Paid", b.totalPaidAmount],
          ["Remaining", b.remainingAmount],
          ["Payment status", b.paymentStatus],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs uppercase text-white/50">{k}</p>
            <p className="text-xl font-black capitalize">
              {k === "Payment status"
                ? String(v).replaceAll("_", " ")
                : formatCurrency(v / 100)}
            </p>
          </div>
        ))}
      </section>
      <PaymentTimeline
        stages={data.stages}
        paying={paying}
        onPay={pay}
        onInvoice={(id) => window.open(invoiceUrl(id), "_blank", "noopener")}
      />
    </main>
  );
}
