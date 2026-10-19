export const bookingStatuses = ["pending", "accepted", "rejected", "cancelled", "completed"];
const tones = {
  pending: "bg-amber-50 text-amber-900 border-amber-200/80",
  accepted: "bg-sage text-[#344C38] border-[#BACDBB]",
  rejected: "bg-red-50 text-red-800 border-red-200/80",
  cancelled: "bg-sand text-ink/70 border-ink/10",
  completed: "bg-[#E5ECEF] text-[#345763] border-[#C6D6DB]"
};
export default function BookingStatus({
  status
}) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold capitalize ${tones[status] || "border-ink/10 bg-sand text-ink"}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status}
  </span>;
}
