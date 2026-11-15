import ApiError from "./ApiError.js";

// Marketplace dates are UTC calendar days, independent of browser/server locale.
// A date-only event has no finish time, so completion starts on the next UTC day.
export const utcToday = (now = new Date()) => now.toISOString().slice(0, 10);

export function normalizeDateOnly(value, fieldName = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${fieldName} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `Please provide a valid ${fieldName}.`);
  }
  return value;
}

export function storedBookingDay(booking) {
  const day = booking.eventDate instanceof Date && Number.isFinite(booking.eventDate.getTime())
    ? booking.eventDate.toISOString().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      (booking.eventDateOnly && booking.eventDateOnly !== day)) {
    throw new ApiError(409, "Booking date needs correction before reserving this date.");
  }
  return day;
}

export function assertBookingCompletionDay(day, now = new Date()) {
  if (day >= utcToday(now)) {
    throw new ApiError(409, "Bookings can only be completed after the event's UTC calendar day has ended.");
  }
}
