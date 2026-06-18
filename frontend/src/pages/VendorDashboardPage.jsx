import { CalendarCheck, IndianRupee, Inbox, Star, TrendingUp } from "lucide-react";
import Button from "../components/Button";
import Card from "../components/Card";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const requests = [
  { customer: "Riya Sharma", event: "Wedding Reception", date: "24 Aug 2026", budget: "₹1,50,000", status: "New" },
  { customer: "Dev Khanna", event: "Corporate Gala", date: "10 Sep 2026", budget: "₹2,20,000", status: "New" },
  { customer: "Mehak Arora", event: "Engagement", date: "02 Jul 2026", budget: "₹95,000", status: "Discussing" },
];

export default function VendorDashboardPage() {
  useDocumentTitle("Vendor dashboard");
  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-coral">Your business at a glance</p><h1 className="mt-1 text-3xl font-extrabold">Welcome back, Aarav.</h1><p className="mt-2 text-sm text-ink/45">You have 2 new booking requests waiting.</p></div><Button to="/vendor/profile" variant="outline">Edit profile</Button></div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[[Inbox, "Total requests", "42", "+12% this month"], [CalendarCheck, "Accepted bookings", "18", "3 upcoming"], [IndianRupee, "Earnings", "₹8.4L", "+18% this year"], [Star, "Reviews", "4.9", "126 total"]].map(([Icon, title, value, note]) => <Card key={title} className="p-6"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-plum/10 text-plum"><Icon className="h-5 w-5" /></span><TrendingUp className="h-4 w-4 text-sage" /></div><p className="mt-6 text-3xl font-extrabold">{value}</p><p className="mt-1 text-sm text-ink/45">{title}</p><p className="mt-3 text-xs font-semibold text-sage">{note}</p></Card>)}
      </div>
      <Card className="mt-7 overflow-hidden"><div className="flex items-center justify-between border-b p-6"><div><h2 className="text-xl font-extrabold">Latest requests</h2><p className="mt-1 text-xs text-ink/40">Respond quickly to improve your visibility.</p></div><button className="text-xs font-bold text-coral">View all</button></div><div className="divide-y">{requests.map((request) => <div key={request.customer} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center lg:grid-cols-[1.2fr_1fr_1fr_auto]"><div><p className="font-bold">{request.customer}</p><p className="mt-1 text-xs text-ink/40">{request.event}</p></div><p className="text-sm text-ink/50">{request.date}</p><p className="text-sm font-bold">{request.budget}</p><div className="flex gap-2"><Button variant="outline" className="!px-4 !py-2">Decline</Button><Button className="!px-4 !py-2">Review</Button></div></div>)}</div></Card>
    </div>
  );
}
