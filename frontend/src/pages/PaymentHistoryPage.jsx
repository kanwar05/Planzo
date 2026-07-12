import { useEffect, useState } from "react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import { getPaymentHistory, invoiceUrl } from "../services/paymentService";
import { formatCurrency, formatDate } from "../utils/format";
export default function PaymentHistoryPage() {
  const [items, setItems] = useState();
  useEffect(() => {
    getPaymentHistory().then(setItems);
  }, []);
  if (!items) return <LoadingSkeleton />;
  return (
    <main className="p-6">
      <h1 className="text-3xl font-black">Payment history</h1>
      {!items.length ? (
        <EmptyState title="No payments yet" />
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                {[
                  "Date",
                  "Stage",
                  "Amount",
                  "Status",
                  "Transaction",
                  "Invoice",
                ].map((x) => (
                  <th className="p-3" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr className="border-t" key={p.id}>
                  <td className="p-3">{formatDate(p.createdAt)}</td>
                  <td className="p-3">
                    {p.installmentType.replaceAll("_", " ")}
                  </td>
                  <td className="p-3">{formatCurrency(p.amount / 100)}</td>
                  <td className="p-3">{p.status}</td>
                  <td className="p-3">{p.transactionId || "—"}</td>
                  <td className="p-3">
                    {p.invoiceNumber && (
                      <a className="text-coral" href={invoiceUrl(p.id)}>
                        Download
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
