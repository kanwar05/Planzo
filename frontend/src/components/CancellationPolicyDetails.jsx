export const legacyCancellationPolicy = {
  key: "legacy", version: 0, title: "Existing cancellation terms",
  description: "This booking or quotation keeps its existing cancellation rights. No newer cutoff is applied retrospectively.",
  customerPendingCutoffHours: null, customerAcceptedCutoffHours: null, vendorCutoffHours: null,
  timeZone: "UTC",
  consequences: "Cancellation does not calculate, guarantee or initiate a refund. No online payment is processed in Planzo.",
};
export const cancellationTimeZone = policy => policy?.timeZone === "Asia/Kolkata" ? "Asia/Kolkata" : "UTC";
const zoneLabel = policy => cancellationTimeZone(policy) === "Asia/Kolkata" ? "IST" : "UTC";
const cutoff = (hours, policy) => hours == null ? "No date cutoff while the booking remains eligible." : hours === 0
  ? `Before midnight ${zoneLabel(policy)} at the start of the event day.`
  : `At least ${hours} hours before midnight ${zoneLabel(policy)} at the start of the event day.`;
export function formatCancellationInstant(value, policy) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: cancellationTimeZone(policy), day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)} ${zoneLabel(policy)}`;
}
export function CancellationPolicyCutoffs({ policy, eligibility }) {
  const customer = formatCancellationInstant(eligibility?.customerCutoffAt, policy);
  const vendor = formatCancellationInstant(eligibility?.vendorCutoffAt, policy);
  if (!customer && !vendor) return null;
  return <dl className="space-y-2 text-xs leading-6">{customer && <div><dt className="font-semibold">Customer cancellation cutoff</dt><dd>{customer}</dd></div>}{vendor && <div><dt className="font-semibold">Vendor cancellation cutoff</dt><dd>{vendor}</dd></div>}</dl>;
}
export default function CancellationPolicyDetails({ policy, legacy = false }) {
  const value = policy || legacyCancellationPolicy;
  return <section aria-label="Cancellation policy" className="space-y-3 rounded-xl border border-ink/10 bg-sand/40 p-4 text-xs leading-6">
    <h4 className="text-sm font-bold">{value.title || "Cancellation policy"} · Version {value.version ?? 0}</h4>
    {(legacy || value.key === "legacy") && <p className="font-semibold">Grandfathered cancellation terms</p>}
    {value.description && <p className="whitespace-pre-line break-words">{value.description}</p>}
    <dl className="space-y-2"><div><dt className="font-semibold">Customer, before acceptance</dt><dd>{cutoff(value.customerPendingCutoffHours, value)}</dd></div><div><dt className="font-semibold">Customer, after acceptance</dt><dd>{cutoff(value.customerAcceptedCutoffHours, value)}</dd></div><div><dt className="font-semibold">Vendor cancellation</dt><dd>{cutoff(value.vendorCutoffHours, value)} A reason is required.</dd></div></dl>
    {typeof value.consequences === "string" && <p className="whitespace-pre-line break-words">{value.consequences}</p>}
    <p>Policy cutoff dates use {cancellationTimeZone(value) === "Asia/Kolkata" ? "Asia/Kolkata (IST)" : "UTC"}. Support decisions do not themselves change bookings or agreed commercial terms.</p>
  </section>;
}
