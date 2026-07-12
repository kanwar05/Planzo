import { useEffect, useState } from "react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { getVendorEarnings } from "../services/paymentService";
import { formatCurrency } from "../utils/format";
export default function VendorEarningsPage() {
  const [data, setData] = useState();
  useEffect(() => {
    getVendorEarnings().then(setData);
  }, []);
  if (!data) return <LoadingSkeleton />;
  return (
    <main className="p-6">
      <h1 className="text-3xl font-black">Earnings & payouts</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {Object.entries(data.totals).map(([k, v]) => (
          <div className="rounded-2xl bg-white p-5 shadow-soft" key={k}>
            <p className="capitalize text-ink/50">{k}</p>
            <p className="text-2xl font-black">{formatCurrency(v / 100)}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {[
                "Booking",
                "Status",
                "Gross",
                "Fee",
                "Refunds",
                "Net",
                "Reference",
              ].map((x) => (
                <th className="p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.payouts.map((p) => (
              <tr className="border-t" key={p.id}>
                <td className="p-3">{p.id}</td>
                <td className="p-3">{p.status}</td>
                <td className="p-3">{formatCurrency(p.gross / 100)}</td>
                <td className="p-3">{formatCurrency(p.platformFee / 100)}</td>
                <td className="p-3">
                  {formatCurrency(p.refundDeduction / 100)}
                </td>
                <td className="p-3">{formatCurrency(p.net / 100)}</td>
                <td className="p-3">{p.reference || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
