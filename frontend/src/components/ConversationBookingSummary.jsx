import { useEffect, useState } from "react";
import BookingStatus from "./BookingStatus";
import PackageDetails from "./PackageDetails";
import QuotationDetails from "./QuotationDetails";
import { getQuotations } from "../services/quotationService";
import { formatDate } from "../utils/format";

export default function ConversationBookingSummary({ booking }) {
  const [quotation, setQuotation] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setQuotation(null); setError("");
    if (!booking?.quotationRevision || booking.acceptedAgreement) return;
    getQuotations(booking._id).then(rows => { if (active) setQuotation([...rows].sort((a, b) => b.revision - a.revision)[0] || null); })
      .catch(() => { if (active) setError("Quotation details could not be loaded. Check your booking dashboard."); });
    return () => { active = false; };
  }, [booking?._id, booking?.quotationRevision, booking?.acceptedAgreement]);
  if (!booking) return null;
  return <details className="rounded-2xl border border-ink/10 bg-white p-4 sm:p-5">
    <summary className="cursor-pointer text-sm font-bold">Booking and quotation details</summary>
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{booking.eventType} · {formatDate(booking.eventDate)} UTC</p><BookingStatus status={booking.status} /></div>
      <p className="break-words text-sm">{booking.eventLocation}</p>
      {booking.description && <p className="whitespace-pre-line break-words text-sm leading-7">{booking.description}</p>}
      {booking.selectedPackage && <PackageDetails item={booking.selectedPackage} />}
      {booking.acceptedAgreement ? <QuotationDetails quotation={booking.acceptedAgreement} accepted /> : quotation ? <QuotationDetails quotation={quotation} /> : <p className="text-xs leading-6 text-ink/65">{booking.quotationRevision ? `Quotation version ${booking.quotationRevision} · ${booking.quotationStatus}` : "No final quotation has been sent."}</p>}
      {error && <p className="text-xs text-red-800">{error}</p>}
      <p className="text-xs leading-6 text-ink/65">Messages coordinate your booking. An agreed price or scope changes only through the existing quotation workflow.</p>
    </div>
  </details>;
}
