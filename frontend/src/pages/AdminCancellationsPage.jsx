import { useEffect, useState } from "react";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import Toast from "../components/Toast";
import {
  getAdminCancellations,
  reviewCancellationRefund,
} from "../services/bookingService";
import { formatCurrency, formatDate } from "../utils/format";
import { getApiError } from "../utils/apiError";

export default function AdminCancellationsPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = () =>
    getAdminCancellations(status ? { status } : {})
      .then(setItems)
      .catch((e) => setError(getApiError(e, "Unable to load cancellations.")));
  useEffect(load, [status]);
  const decide = async (item, decision) => {
    const reason = window.prompt(`Reason to ${decision} this refund`);
    if (!reason?.trim()) return;
    try {
      await reviewCancellationRefund(item._id, decision, reason.trim());
      setMessage(`Refund ${decision === "approve" ? "approved" : "rejected"}.`);
      load();
    } catch (e) {
      setError(getApiError(e, "Review failed."));
    }
  };
  return (
    <section className="section-pad container-shell">
      <Toast
        message={error || message}
        type={error ? "error" : "success"}
        onClose={() => {
          setError("");
          setMessage("");
        }}
      />
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold">
              Cancellation and refunds
            </h1>
            <p className="mt-2 text-ink/50">
              Review policy calculations, disputes, and refund requests.
            </p>
          </div>
          <select
            className="field w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {[
              "pending_review",
              "disputed",
              "processing",
              "refunded",
              "rejected",
              "not_applicable",
            ].map((x) => (
              <option key={x} value={x}>
                {x.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {!items.length ? (
          <div className="mt-8">
            <EmptyState
              title="No cancellations"
              description="Cancellation requests will appear here."
            />
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {items.map((item) => (
              <article
                key={item._id}
                className="rounded-[1.75rem] border bg-white p-6 shadow-soft"
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-extrabold">
                      {item.vendor?.businessName}
                    </h2>
                    <p className="text-sm text-ink/50">
                      Customer: {item.customer?.name} · Cancelled by{" "}
                      {item.cancelledByRole} · {formatDate(item.cancelledAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-sm font-bold">
                    {item.refundStatus.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-4">
                  <b>Cancellation reason:</b> {item.cancellationReason}
                </p>
                {item.disputeReason && (
                  <p className="mt-2 text-red-700">
                    <b>Dispute:</b> {item.disputeReason}
                  </p>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div>
                    Paid
                    <br />
                    <b>{formatCurrency(item.paidAmount / 100)}</b>
                  </div>
                  <div>
                    Refund
                    <br />
                    <b>{formatCurrency(item.refundAmount / 100)}</b>
                  </div>
                  <div>
                    Refund rate
                    <br />
                    <b>{item.refundPercentage}%</b>
                  </div>
                  <div>
                    Late fee
                    <br />
                    <b>{formatCurrency(item.lateCancellationFee / 100)}</b>
                  </div>
                </div>
                {["pending_review", "disputed"].includes(item.refundStatus) && (
                  <div className="mt-5 flex gap-3">
                    <Button onClick={() => decide(item, "approve")}>
                      Approve refund
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => decide(item, "reject")}
                    >
                      Reject refund
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
