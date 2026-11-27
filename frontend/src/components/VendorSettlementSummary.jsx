import { useEffect, useState } from "react";
import Card from "./Card";
import { getVendorSettlement } from "../services/paymentService";
import { getApiError } from "../utils/apiError";

const money = paise => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR",
}).format(paise / 100);

export default function VendorSettlementSummary() {
  const [settlement, setSettlement] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getVendorSettlement().then(value => {
      if (active) setSettlement(value);
    }).catch(requestError => {
      if (active) setError(getApiError(requestError, "Settlement totals are unavailable."));
    });
    return () => { active = false; };
  }, []);
  return <Card as="section" aria-label="Vendor settlement summary" className="p-5 sm:p-6">
    <h2 className="font-bold">Settlement summary</h2>
    {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : settlement ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs text-ink/65">Gross captured</p><p className="mt-1 font-bold tabular-nums">{money(settlement.totals.grossCapturedPaise)}</p></div>
        <div><p className="text-xs text-ink/65">Platform commission</p><p className="mt-1 font-bold tabular-nums">{money(settlement.totals.platformCommissionPaise)}</p></div>
        <div><p className="text-xs text-ink/65">Vendor payable</p><p className="mt-1 font-bold tabular-nums">{money(settlement.totals.vendorPayablePaise)}</p></div>
      </div>
      <p className="mt-4 text-xs leading-5 text-ink/65">Funds are held for reconciliation. Planzo is not initiating vendor payouts while payout capabilities and compliance are being verified.</p>
    </> : <p className="mt-2 text-sm text-ink/65">Loading settlement summary…</p>}
  </Card>;
}
