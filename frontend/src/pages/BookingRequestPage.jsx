import { CalendarDays, CheckCircle2, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import { vendors } from "../data/vendors";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function BookingRequestPage() {
  useDocumentTitle("Booking request");
  const { vendorId } = useParams();
  const vendor = vendors.find((item) => item.id === Number(vendorId)) || vendors[0];
  const [sent, setSent] = useState(false);
  if (sent) return <section className="container-shell grid min-h-[70vh] place-items-center py-20"><div className="max-w-md text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sage/15 text-sage"><CheckCircle2 className="h-8 w-8" /></span><h1 className="mt-6 text-4xl font-extrabold">Request sent!</h1><p className="mt-4 leading-7 text-ink/50">{vendor.name} will review your event details and usually responds within two hours.</p><Button to="/dashboard" className="mt-7">View my bookings</Button></div></section>;
  return (
    <section className="container-shell py-12 sm:py-16"><Button to={`/vendors/${vendor.id}`} variant="ghost" className="!px-0"><ChevronLeft className="h-4 w-4" /> Vendor profile</Button><div className="mx-auto mt-5 grid max-w-5xl gap-8 lg:grid-cols-[1fr_330px]">
      <div className="rounded-[2rem] border bg-white p-6 shadow-soft sm:p-9"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-coral">Almost there</p><h1 className="mt-3 text-3xl font-extrabold">Tell us about your event.</h1><p className="mt-2 text-sm text-ink/50">A little detail helps {vendor.name} create a more accurate proposal.</p>
        <form onSubmit={(event) => { event.preventDefault(); setSent(true); }} className="mt-8 grid gap-5 sm:grid-cols-2">
          <div><label className="label">Event type</label><select required className="field"><option value="">Select event</option><option>Wedding</option><option>Birthday</option><option>Corporate Event</option><option>Anniversary</option><option>Other</option></select></div>
          <div><label className="label">Event date</label><input required type="date" className="field" /></div>
          <div className="sm:col-span-2"><label className="label">Event location</label><input required className="field" placeholder="Venue, area, or city" /></div>
          <div className="sm:col-span-2"><label className="label">Estimated budget</label><input required type="number" className="field" placeholder="₹ 100,000" /></div>
          <div className="sm:col-span-2"><label className="label">Special requirements</label><textarea className="field min-h-32 resize-none" placeholder="Guest count, preferred style, timings, or anything else..." /></div>
          <Button type="submit" className="sm:col-span-2"><CalendarDays className="h-4 w-4" /> Submit booking request</Button>
        </form>
      </div>
      <aside className="h-fit rounded-[2rem] bg-ink p-5 text-white"><img src={vendor.image} alt={vendor.name} className="h-44 w-full rounded-2xl object-cover" /><p className="mt-5 text-xs font-bold uppercase tracking-wider text-coral">{vendor.type}</p><h2 className="mt-1 text-xl font-extrabold">{vendor.name}</h2><p className="mt-2 text-sm text-white/50">{vendor.location} · {vendor.rating} ★</p><div className="my-5 border-t border-white/10" /><p className="text-xs text-white/40">Typical package</p><p className="mt-1 font-bold">{vendor.price}</p></aside>
    </div></section>
  );
}
