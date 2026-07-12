import { useEffect, useState } from "react";
import Button from "../components/Button";
import { getAdminPayments, refundPayment } from "../services/paymentService";
import { formatCurrency, formatDate } from "../utils/format";
export default function AdminPaymentsPage({ failed = false }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(failed ? "failed" : "");
  const load = () => getAdminPayments(status ? { status } : {}).then(setItems);
  useEffect(load, [status]);
  const refund = async (p) => {
    const raw = window.prompt("Refund amount in paise");
    if (!raw) return;
    const reason = window.prompt("Required refund reason");
    if (!reason) return;
    await refundPayment(p.id, { amount: Number(raw), reason });
    load();
  };
  return (
    <main className="p-6">
      <h1 className="text-3xl font-black">
        {failed ? "Failed payments" : "Payments"}
      </h1>
      {!failed && (
        <select
          className="mt-5 rounded-xl border p-3"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "created",
            "pending",
            "authorized",
            "captured",
            "failed",
            "partially_refunded",
            "refunded",
            "cancelled",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      )}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {[
                "Date",
                "Transaction",
                "Stage",
                "Amount",
                "Status",
                "Action",
              ].map((x) => (
                <th className="p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr className="border-t" key={p._id}>
                <td className="p-3">{formatDate(p.createdAt)}</td>
                <td className="p-3">{p.transactionId || "—"}</td>
                <td className="p-3">{p.installmentType}</td>
                <td className="p-3">{formatCurrency(p.amount / 100)}</td>
                <td className="p-3">{p.status}</td>
                <td className="p-3">
                  {["captured", "partially_refunded"].includes(p.status) && (
                    <Button onClick={() => refund({ ...p, id: p._id })}>
                      Refund
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
