import { CalendarCheck, CalendarClock, CheckCircle2, Clock3, IndianRupee, MapPin } from "lucide-react";
import Card from "../components/Card";
import Button from "../components/Button";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const bookings = [
  { vendor: "Velvet Petal Decor", event: "Wedding Reception", date: "24 Aug 2026", location: "New Delhi", status: "Confirmed", amount: "₹1,45,000" },
  { vendor: "DJ Armaan Live", event: "Wedding Sangeet", date: "23 Aug 2026", location: "New Delhi", status: "Pending", amount: "₹55,000" },
  { vendor: "Saffron Table", event: "Engagement", date: "12 Feb 2026", location: "Gurugram", status: "Completed", amount: "₹1,80,000" },
];

export default function CustomerDashboardPage() {
  useDocumentTitle("Customer dashboard");
  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-coral">Thursday, 18 June</p><h1 className="mt-1 text-3xl font-extrabold">Good morning, Riya.</h1><p className="mt-2 text-sm text-ink/45">Here’s what’s happening with your celebrations.</p></div><Button to="/vendors">Find a vendor</Button></div>
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {[[CalendarCheck, "Total bookings", "08", "2 added this month"], [CalendarClock, "Upcoming events", "03", "Next in 18 days"], [CheckCircle2, "Completed", "05", "All rated"]].map(([Icon, title, value, note]) => <Card key={title} className="p-6"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-coral/10 text-coral"><Icon className="h-5 w-5" /></span><span className="text-xs font-semibold text-sage">{note}</span></div><p className="mt-7 text-3xl font-extrabold">{value}</p><p className="mt-1 text-sm text-ink/45">{title}</p></Card>)}
      </div>
      <Card className="mt-7 overflow-hidden"><div className="flex items-center justify-between border-b p-6"><div><h2 className="text-xl font-extrabold">Recent bookings</h2><p className="mt-1 text-xs text-ink/40">Track your active and completed requests.</p></div><button className="text-xs font-bold text-coral">View all</button></div><div className="divide-y">{bookings.map((booking) => <div key={booking.vendor} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center lg:grid-cols-[1.4fr_1fr_1fr_auto]"><div><p className="font-bold">{booking.vendor}</p><p className="mt-1 text-xs text-ink/40">{booking.event}</p></div><p className="flex items-center gap-2 text-sm text-ink/50"><Clock3 className="h-4 w-4" /> {booking.date}</p><p className="flex items-center gap-2 text-sm text-ink/50"><MapPin className="h-4 w-4" /> {booking.location}</p><div className="text-right"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${booking.status === "Confirmed" ? "bg-sage/15 text-sage" : booking.status === "Pending" ? "bg-amber-100 text-amber-700" : "bg-ink/5 text-ink/50"}`}>{booking.status}</span><p className="mt-2 flex items-center justify-end text-sm font-bold"><IndianRupee className="h-3.5 w-3.5" />{booking.amount.replace("₹", "")}</p></div></div>)}</div></Card>
    </div>
  );
}
