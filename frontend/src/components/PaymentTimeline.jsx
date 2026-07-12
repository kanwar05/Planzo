import { Check, Clock3, LockKeyhole, ReceiptIndianRupee } from "lucide-react";
import Button from "./Button";
import { formatCurrency, formatDate } from "../utils/format";
const labels = {
  booking_deposit: "Booking Confirmation",
  event_day_payment: "Event-Day Payment",
  final_payment: "Final Payment",
};
const actionLabels = {
  booking_deposit: "Pay 25% Booking Amount",
  event_day_payment: "Pay 40% Event-Day Amount",
  final_payment: "Pay Final 35%",
};
const display = (stage) => {
  const paid = stage.payments.find((p) =>
    ["captured", "partially_refunded", "refunded"].includes(p.status),
  );
  const processing = stage.payments.find((p) =>
    ["created", "pending", "authorized"].includes(p.status),
  );
  const failed = [...stage.payments]
    .reverse()
    .find((p) => p.status === "failed");
  if (paid)
    return {
      label:
        paid.status === "refunded"
          ? "Refunded"
          : paid.status === "partially_refunded"
            ? "Partially Refunded"
            : "Paid",
      icon: Check,
      tone: "bg-emerald-50 text-emerald-700",
      payment: paid,
    };
  if (processing)
    return {
      label: "Processing",
      icon: Clock3,
      tone: "bg-amber-50 text-amber-700",
      payment: processing,
    };
  if (failed)
    return {
      label: "Failed",
      icon: Clock3,
      tone: "bg-red-50 text-red-700",
      payment: failed,
    };
  return stage.eligibility.eligible
    ? { label: "Due", icon: ReceiptIndianRupee, tone: "bg-coral/10 text-coral" }
    : { label: "Locked", icon: LockKeyhole, tone: "bg-ink/5 text-ink/50" };
};
export default function PaymentTimeline({
  stages = [],
  paying,
  onPay,
  onInvoice,
}) {
  return (
    <div className="space-y-4">
      {stages.map((stage, index) => {
        const state = display(stage);
        const Icon = state.icon;
        return (
          <article
            key={stage.installmentType}
            className="rounded-2xl border border-ink/10 bg-white p-5 shadow-soft"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full ${state.tone}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-ink/40">
                    Step {index + 1} · {stage.percentage}%
                  </p>
                  <h3 className="text-lg font-extrabold">
                    {labels[stage.installmentType]}
                  </h3>
                  <p className="font-bold text-coral">
                    {formatCurrency(stage.amount / 100)}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${state.tone}`}
              >
                {state.label}
              </span>
            </div>
            <div className="mt-4 text-sm text-ink/60">
              {state.payment?.paidAt && (
                <p>
                  Paid {formatDate(state.payment.paidAt)} ·{" "}
                  {state.payment.transactionId}
                </p>
              )}
              {state.payment?.paymentMethod && (
                <p>Method: {state.payment.paymentMethod}</p>
              )}
              {state.payment?.failureReason && (
                <p className="text-red-600">{state.payment.failureReason}</p>
              )}
              {state.payment?.refundedAmount > 0 && (
                <p>
                  Refunded: {formatCurrency(state.payment.refundedAmount / 100)}
                </p>
              )}
              {!stage.eligibility.eligible && !state.payment && (
                <p>{stage.eligibility.reason || "Payment is not currently available"}</p>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              {!state.payment && (
                <Button
                  disabled={paying || !stage.eligibility.eligible}
                  onClick={() => onPay(stage.installmentType)}
                >
                  {paying && stage.eligibility.eligible
                    ? "Creating payment order..."
                    : actionLabels[stage.installmentType]}
                </Button>
              )}
              {state.payment?.invoiceNumber && (
                <Button
                  variant="secondary"
                  onClick={() => onInvoice(state.payment.id)}
                >
                  Download invoice
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
