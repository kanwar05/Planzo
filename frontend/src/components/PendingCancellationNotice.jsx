import { useEffect, useState } from "react";
import CancellationPolicyDetails from "./CancellationPolicyDetails";
import { getCurrentCancellationPolicy } from "../services/cancellationPolicyService";

export default function PendingCancellationNotice({ vendorId }) {
  const [policy, setPolicy] = useState(null), [error, setError] = useState(false);
  useEffect(() => {
    if (!/^[a-f0-9]{24}$/i.test(vendorId)) return;
    let active = true;
    getCurrentCancellationPolicy().then(value => { if (active) setPolicy(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [vendorId]);
  if (!policy && !error) return null;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-bold">Cancellation information</summary><div className="mt-4">{policy ? <CancellationPolicyDetails policy={policy} /> : <p className="text-xs leading-6 text-red-800">The current policy could not be loaded. Cancellation eligibility is checked on the server; review the booking's policy before relying on a cutoff.</p>}</div></details>;
}
