export const formatCurrency = value => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
}).format(value);
// Marketplace bookings reserve a whole UTC calendar day, independent of the browser zone.
export const todayDate = (now = new Date()) => now.toISOString().slice(0, 10);
function parseBookingDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const literal = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value);
  if (!literal) return null;
  const calendar = new Date(`${literal[1]}T00:00:00.000Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== literal[1]) return null;
  const date = value === literal[1] ? calendar : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
export const formatDate = value => {
  const date = parseBookingDate(value);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
};

export function canCompleteBooking(booking, now = new Date()) {
  const stored = booking.eventDateOnly;
  const date = parseBookingDate(booking.eventDate);
  if (!date) return false;
  const day = date.toISOString().slice(0, 10);
  if (stored && stored !== day) return false;
  return booking.status === "accepted" && day < todayDate(now);
}
