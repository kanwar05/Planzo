import { useEffect, useRef, useState } from "react";
import Button from "../components/Button";
import CancellationPolicyDetails from "../components/CancellationPolicyDetails";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getCancellationPolicies, publishCancellationPolicy } from "../services/cancellationPolicyService";
import { getApiError } from "../utils/apiError";

const blank = { title: "", description: "", customerPendingCutoffHours: "", customerAcceptedCutoffHours: "0", vendorCutoffHours: "0", consequences: "" };
const asForm = policy => ({ title: policy.title || "", description: policy.description || "", consequences: policy.consequences || "",
  ...Object.fromEntries(["customerPendingCutoffHours", "customerAcceptedCutoffHours", "vendorCutoffHours"].map(key => [key, policy[key] == null ? "" : String(policy[key])])) });
const hours = value => {
  if (value === "") return null;
  if (!/^(?:0|[1-9]\d*)$/.test(value) || Number(value) > 8760) throw new Error("Cutoffs must be whole hours from 0 to 8,760, or blank for no cutoff.");
  return Number(value);
};
export default function AdminCancellationPoliciesPage() {
  useDocumentTitle("Cancellation policies");
  const [activePolicy, setActivePolicy] = useState(null), [policies, setPolicies] = useState([]), [before, setBefore] = useState(null);
  const [form, setForm] = useState(blank), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [retry, setRetry] = useState(0);
  const lock = useRef(false), scope = useRef(null);
  useEffect(() => {
    const current = { active: true }; scope.current = current; setLoading(true); setError("");
    getCancellationPolicies({ limit: 20 }).then(result => {
      if (!current.active) return;
      setActivePolicy(result.activePolicy); setForm(asForm(result.activePolicy)); setPolicies(result.policies || []);
      setBefore(result.pagination?.hasMore ? result.pagination.nextBefore : null);
    }).catch(err => { if (current.active) setError(getApiError(err, "Cancellation policies could not be loaded.")); })
      .finally(() => { if (current.active) setLoading(false); });
    return () => { current.active = false; };
  }, [retry]);
  const field = key => ({ value: form[key], onChange: event => setForm(current => ({ ...current, [key]: event.target.value })) });
  const publish = async event => {
    event.preventDefault(); if (lock.current || !activePolicy) return;
    const current = scope.current; lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const body = { expectedVersion: activePolicy.version, title: form.title.trim(), description: form.description.trim(), consequences: form.consequences.trim(),
        customerPendingCutoffHours: hours(form.customerPendingCutoffHours), customerAcceptedCutoffHours: hours(form.customerAcceptedCutoffHours), vendorCutoffHours: hours(form.vendorCutoffHours) };
      const result = await publishCancellationPolicy(body);
      if (current.active) { setActivePolicy(result.policy); setForm(asForm(result.policy)); setPolicies(rows => [result.policy, ...rows.filter(row => row.version !== result.policy.version)]); setMessage("New policy version published. Existing quoted and accepted policy snapshots remain unchanged."); }
    } catch (err) { if (current.active) setError(getApiError(err, "Policy publication could not be confirmed. Reload the latest version before trying again.")); }
    finally { lock.current = false; if (current.active) setBusy(false); }
  };
  const earlier = async () => {
    if (lock.current || before == null) return;
    const current = scope.current; lock.current = true; setBusy(true); setError("");
    try {
      const result = await getCancellationPolicies({ before, limit: 20 });
      if (current.active) { setPolicies(rows => [...rows, ...(result.policies || []).filter(next => !rows.some(row => row.version === next.version))]); setBefore(result.pagination?.hasMore ? result.pagination.nextBefore : null); }
    } catch (err) { if (current.active) setError(getApiError(err, "Earlier policy versions could not be loaded.")); }
    finally { lock.current = false; if (current.active) setBusy(false); }
  };
  return <div className="mx-auto max-w-4xl space-y-6"><header><p className="text-xs font-bold uppercase tracking-wider text-coral">Marketplace policy</p><h1 className="mt-2 font-editorial text-4xl">Cancellation policies</h1><p className="mt-3 text-sm leading-7 text-ink/65">Publish new versions for future quotation offers and requests. Previously offered or accepted terms cannot be rewritten.</p></header>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><Button variant="ghost" disabled={busy} onClick={() => setRetry(value => value + 1)}>Reload current policy</Button></div>}
    {message && <p role="status" className="rounded-xl bg-sage p-4 text-sm leading-7">{message}</p>}
    {loading ? <LoadingSkeleton /> : activePolicy && <><CancellationPolicyDetails policy={activePolicy} />
      <form onSubmit={publish} className="space-y-4 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="font-editorial text-2xl">Publish version {activePolicy.version + 1}</h2><fieldset disabled={busy} className="space-y-4">
        <label className="block"><span className="label">Policy title</span><input required maxLength={120} {...field("title")} className="field" /></label>
        <label className="block"><span className="label">Policy description</span><textarea required rows={3} maxLength={2000} {...field("description")} className="field" /></label>
        <div className="grid gap-4 sm:grid-cols-3">{[["customerPendingCutoffHours", "Customer pending cutoff (hours)"], ["customerAcceptedCutoffHours", "Customer accepted cutoff (hours)"], ["vendorCutoffHours", "Vendor cutoff (hours)"]].map(([key, label]) => <label key={key}><span className="label">{label}</span><input type="number" min="0" max="8760" step="1" {...field(key)} className="field" /></label>)}</div>
        <p className="text-xs leading-6 text-ink/65">Blank means no date cutoff. Zero means before the IST event day begins. Positive hours are measured before that IST midnight.</p>
        <label className="block"><span className="label">Cancellation consequences</span><textarea required rows={4} maxLength={2000} {...field("consequences")} className="field" /></label><p className="text-xs leading-6 text-ink/65">Describe service coordination and support consequences only. Do not state a refund amount or promise a financial transaction.</p>
      </fieldset><Button type="submit" loading={busy}>Publish new policy version</Button></form>
      <section className="space-y-3"><h2 className="font-editorial text-2xl">Published history</h2>{policies.length ? policies.map(policy => <details key={policy.version} className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-bold">Version {policy.version} · {policy.title}</summary><div className="mt-4"><CancellationPolicyDetails policy={policy} /></div></details>) : <p className="text-sm text-ink/65">The default policy is active. No additional versions have been published.</p>}{before != null && <Button variant="outline" disabled={busy} onClick={earlier}>Load earlier policy versions</Button>}</section>
    </>}
  </div>;
}
