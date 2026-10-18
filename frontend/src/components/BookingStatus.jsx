export const bookingStatuses = ["pending", "accepted", "rejected", "cancelled", "completed"];
const tones = {
  pending: "bg-amber-50 text-amber-800",
  accepted: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
  completed: "bg-emerald-50 text-emerald-700"
};
export default function BookingStatus({
  status
}) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold capitalize ${tones[status] || "bg-sand text-ink"}`}>
    {status}
  </span>;
}
