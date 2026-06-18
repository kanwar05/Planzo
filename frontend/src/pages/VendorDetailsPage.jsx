import { BadgeCheck, CalendarDays, Check, ChevronLeft, Clock3, MapPin, Share2, Star } from "lucide-react";
import { useParams } from "react-router-dom";
import Button from "../components/Button";
import { vendors } from "../data/vendors";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function VendorDetailsPage() {
  const { id } = useParams();
  const vendor = vendors.find((item) => item.id === Number(id)) || vendors[0];
  useDocumentTitle(vendor.name);
  const gallery = [vendor.image, ...vendors.filter((item) => item.type === vendor.type && item.id !== vendor.id).slice(0, 3).map((item) => item.image)];
  return (
    <>
      <section className="container-shell py-5"><Button to="/vendors" variant="ghost" className="!px-0"><ChevronLeft className="h-4 w-4" /> Back to vendors</Button><div className="mt-3 grid h-[430px] grid-cols-2 gap-3 overflow-hidden rounded-[2rem] sm:grid-cols-4"><img src={gallery[0]} alt={vendor.name} className="col-span-2 h-full w-full object-cover sm:row-span-2" />{gallery.slice(1).map((image, index) => <img key={index} src={image} alt="" className="hidden h-full w-full object-cover sm:block" />)}</div></section>
      <section className="container-shell grid items-start gap-10 pb-20 pt-5 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex items-start justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-coral">{vendor.type}</p><h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold sm:text-5xl">{vendor.name}<BadgeCheck className="h-6 w-6 fill-coral text-white" /></h1><div className="mt-4 flex flex-wrap gap-4 text-sm text-ink/55"><span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> <strong className="text-ink">{vendor.rating}</strong> ({vendor.reviews} reviews)</span><span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {vendor.location}</span><span className="flex items-center gap-1"><Clock3 className="h-4 w-4" /> {vendor.experience} years</span></div></div><button className="grid h-11 w-11 place-items-center rounded-full border bg-white"><Share2 className="h-4 w-4" /></button></div>
          <div className="my-9 border-t" />
          <h2 className="text-2xl font-extrabold">About {vendor.name}</h2><p className="mt-4 max-w-3xl leading-8 text-ink/55">{vendor.description} Their team is known for thoughtful preparation, warm communication, and details that feel personal rather than formulaic. Every proposal is tailored to your guest list, venue, and vision.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">{["Verified by PLANZO", "Personalized proposals", "Transparent package pricing", "Dedicated event coordinator"].map((item) => <p key={item} className="flex items-center gap-3 rounded-2xl bg-sage/10 p-4 text-sm font-semibold"><Check className="h-4 w-4 text-sage" />{item}</p>)}</div>
          <div className="my-9 border-t" />
          <h2 className="text-2xl font-extrabold">Portfolio highlights</h2><div className="mt-5 grid grid-cols-2 gap-4">{gallery.map((image, index) => <img key={index} src={image} alt={`Portfolio ${index + 1}`} className={`h-56 w-full rounded-2xl object-cover ${index === 0 ? "col-span-2 sm:h-80" : ""}`} />)}</div>
          <div className="my-9 border-t" />
          <h2 className="text-2xl font-extrabold">What customers say</h2><div className="mt-5 rounded-[2rem] bg-white p-7 shadow-soft"><div className="flex gap-1 text-amber-400">{[1,2,3,4,5].map((n) => <Star key={n} className="h-4 w-4 fill-current" />)}</div><p className="mt-4 leading-7 text-ink/65">“Absolutely wonderful to work with. The team understood the mood we wanted immediately and made the entire day feel effortless.”</p><p className="mt-5 text-sm font-bold">Meera Kapoor <span className="font-normal text-ink/40">· Wedding, March 2026</span></p></div>
        </div>
        <aside className="sticky top-28 rounded-[2rem] border bg-white p-6 shadow-lift"><p className="text-xs text-ink/45">Packages starting from</p><p className="mt-1 text-2xl font-extrabold">{vendor.price}</p><div className="my-6 border-t" /><div className="space-y-4 text-sm"><p className="flex items-center justify-between"><span className="text-ink/45">Experience</span><strong>{vendor.experience} years</strong></p><p className="flex items-center justify-between"><span className="text-ink/45">Response time</span><strong>Within 2 hours</strong></p><p className="flex items-center justify-between"><span className="text-ink/45">Next available</span><strong className="text-sage">This weekend</strong></p></div><Button to={`/booking/${vendor.id}`} className="mt-7 w-full"><CalendarDays className="h-4 w-4" /> Request to book</Button><p className="mt-4 text-center text-xs text-ink/40">No payment required to send a request</p></aside>
      </section>
    </>
  );
}
