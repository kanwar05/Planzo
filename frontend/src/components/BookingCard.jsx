import { MapPin, CalendarDays, Mail, Phone } from "lucide-react";
import Button from "./Button";
import Card from "./Card";
import BookingStatus from "./BookingStatus";
import { formatDate } from "../utils/format";
export default function BookingCard({
  booking,
  role = "customer",
  busy = false,
  onStatus
}) {
  const vendor = booking.vendorId;
  const statusReason = booking.status === "rejected" ? booking.rejectionReason : booking.status === "cancelled" ? booking.cancellationReason : "";
  const contacts = role === "customer" && ["accepted", "completed"].includes(booking.status) ? vendor?.contactDetails : null;
  const actions = role === "vendor" ? booking.status === "pending" ? [["Accept", "accepted"], ["Reject", "rejected"]] : booking.status === "accepted" ? [["Mark completed", "completed"]] : [] : ["pending", "accepted"].includes(booking.status) ? [["Cancel booking", "cancelled"]] : [];
  return <Card className="p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-extrabold">
          {role === "vendor" ? booking.customerId?.name || "Customer" : vendor?.businessName || "Vendor unavailable"}
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          {booking.eventType}
        </p>
      </div>
      <BookingStatus status={booking.status} />
    </div>
    <div className="mt-4 flex flex-wrap gap-5 text-sm text-ink/60">
      <p className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4" />
        {formatDate(booking.eventDate)}
      </p>
      <p className="flex items-center gap-2 break-words">
        <MapPin className="h-4 w-4 shrink-0" />
        {booking.eventLocation}
      </p>
    </div>
    {booking.description && <p className="mt-4 whitespace-pre-line break-words text-sm leading-6 text-ink/65">
      {booking.description}
    </p>}
    {booking.notes && <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-ink/55">
      <strong>Customer notes:</strong>
      {booking.notes}
    </p>}
    {statusReason && <p className="mt-3 text-sm text-ink/55">
      <strong>Status note:</strong>
      {statusReason}
    </p>}
    {contacts && (contacts.email || contacts.phone) && <section aria-label="Vendor contact details" className="mt-5 rounded-2xl bg-sage/10 p-4">
      <h3 className="text-sm font-bold">Vendor contact details</h3>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {contacts.phone && <a href={`tel:${contacts.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 font-semibold text-plum">
          <Phone className="h-4 w-4" />
          {contacts.phone}
        </a>}
        {contacts.email && <a href={`mailto:${contacts.email}`} className="flex items-center gap-2 break-all font-semibold text-plum">
          <Mail className="h-4 w-4 shrink-0" />
          {contacts.email}
        </a>}
      </div>
    </section>}
    {role === "customer" && booking.status === "accepted" && !contacts?.phone && !contacts?.email && <p className="mt-4 text-sm text-ink/55">The vendor has not provided contact details for sharing.</p>}
    {actions.length > 0 && <div className="mt-5 flex flex-wrap gap-3">
      {actions.map(([label, status]) => <Button key={status} type="button" variant={status === "rejected" || status === "cancelled" ? "outline" : "primary"} loading={busy} disabled={busy} onClick={() => onStatus(booking._id, status)}>
        {label}
      </Button>)}
    </div>}
  </Card>;
}
