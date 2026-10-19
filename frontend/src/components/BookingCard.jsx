import { MapPin, CalendarDays, Mail, Phone, ArrowUpRight } from "lucide-react";
import Button from "./Button";
import Card from "./Card";
import BookingStatus from "./BookingStatus";
import { formatDate } from "../utils/format";
import { getVendorImage } from "../utils/vendor";

export default function BookingCard({ booking, role = "customer", busy = false, onStatus }) {
  const vendor = booking.vendorId;
  const statusReason = booking.status === "rejected" ? booking.rejectionReason : booking.status === "cancelled" ? booking.cancellationReason : "";
  const contacts = role === "customer" && ["accepted", "completed"].includes(booking.status) ? vendor?.contactDetails : null;
  const actions = role === "vendor" ? booking.status === "pending" ? [["Accept", "accepted"], ["Reject", "rejected"]] : booking.status === "accepted" ? [["Mark completed", "completed"]] : [] : ["pending", "accepted"].includes(booking.status) ? [["Cancel booking", "cancelled"]] : [];
  return <Card as="article" className="overflow-hidden !rounded-2xl !shadow-none">
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        {role === "customer" && <img src={getVendorImage(vendor)} alt="" width={144} height={144} loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-[72px] sm:w-[72px]" />}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-base font-bold leading-6 sm:text-lg">{role === "vendor" ? booking.customerId?.name || "Customer" : vendor?.businessName || "Vendor unavailable"}</h2><BookingStatus status={booking.status} /></div><p className="mt-1.5 break-words text-xs font-medium text-ink/65">{booking.eventType}</p></div>
      </div>
      <div className="mt-5 grid gap-3 rounded-xl bg-sand/55 p-3.5 text-xs text-ink/75 sm:grid-cols-[auto_1fr] sm:gap-5 sm:text-sm"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-coral" aria-hidden="true" /><time dateTime={booking.eventDate}>{formatDate(booking.eventDate)}</time></p><p className="flex min-w-0 items-start gap-2"><MapPin className="h-4 w-4 shrink-0 text-coral" aria-hidden="true" /><span className="break-words">{booking.eventLocation}</span></p></div>
      {booking.description && <p className="mt-4 whitespace-pre-line break-words text-sm leading-7 text-ink/70">{booking.description}</p>}
      {booking.notes && <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-ink/65"><strong className="font-semibold text-ink/80">Customer notes: </strong>{booking.notes}</p>}
      {statusReason && <p className="mt-4 break-words rounded-xl border border-ink/10 px-4 py-3 text-sm leading-6 text-ink/65"><strong className="font-semibold">Status note: </strong>{statusReason}</p>}
      {contacts && (contacts.email || contacts.phone) && <section aria-label="Vendor contact details" className="mt-5 rounded-xl bg-sage/65 p-4"><div className="flex items-center justify-between"><h3 className="text-xs font-bold">Vendor contact details</h3><ArrowUpRight className="h-4 w-4 text-ink/65" aria-hidden="true" /></div><div className="mt-2 grid gap-1 text-sm sm:flex sm:flex-wrap sm:gap-x-6">{contacts.phone && <a href={`tel:${contacts.phone.replace(/[^+\d]/g, "")}`} className="flex min-h-11 items-center gap-2 font-semibold"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{contacts.phone}</a>}{contacts.email && <a href={`mailto:${contacts.email}`} className="flex min-h-11 items-center gap-2 break-all font-semibold"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{contacts.email}</a>}</div></section>}
      {role === "customer" && booking.status === "accepted" && !contacts?.phone && !contacts?.email && <p className="mt-4 text-xs leading-6 text-ink/65">The vendor has not provided contact details for sharing.</p>}
    </div>
    {actions.length > 0 && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink/10 px-4 py-3 sm:px-6">{role === "customer" && booking.status === "pending" && <p className="mr-auto text-xs leading-5 text-ink/65">Awaiting the vendor's response</p>}{actions.map(([label, status]) => <Button key={status} type="button" variant={status === "rejected" || status === "cancelled" ? "outline" : "primary"} loading={busy} disabled={busy} className="!px-4 !py-2.5 !text-xs" onClick={() => onStatus(booking._id, status)}>{label}</Button>)}</div>}
  </Card>;
}
