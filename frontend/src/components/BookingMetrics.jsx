import { CalendarCheck2, CalendarDays, CheckCheck, Clock3 } from "lucide-react";

export default function BookingMetrics({ bookings }) {
  const metrics = [
    ["Total bookings", bookings.length, CalendarDays, "bg-sand"],
    ["Pending bookings", bookings.filter(item => item.status === "pending").length, Clock3, "bg-amber-50"],
    ["Accepted bookings", bookings.filter(item => item.status === "accepted").length, CalendarCheck2, "bg-sage"],
    ["Completed bookings", bookings.filter(item => item.status === "completed").length, CheckCheck, "bg-[#E5ECEF]"]
  ];
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, count, Icon, tone]) => <div key={label} className="min-w-0 rounded-2xl border border-ink/10 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium leading-5 text-ink/65 sm:text-xs">{label}</p><span className={`hidden h-8 w-8 shrink-0 place-items-center rounded-full sm:grid ${tone}`}><Icon className="h-4 w-4 text-ink/65" aria-hidden="true" /></span></div><p className="mt-3 font-editorial text-4xl tabular-nums">{count}</p></div>)}</div>;
}
