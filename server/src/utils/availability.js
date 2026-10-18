import Availability from "../models/Availability.js";
import Booking from "../models/Booking.js";
import ApiError from "./ApiError.js";

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

export function bookingDateFilter(dateOnly) {
  const dayStart = new Date(`${dateOnly}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  return { $or: [
    { eventDateOnly: dateOnly },
    { eventDateOnly: { $in: [null, ""] }, eventDate: { $gte: dayStart, $lt: dayEnd } },
  ] };
}

export async function getBookedDates(vendorId) {
  const bookings = await Booking.find({ vendorId, status: { $in: ["accepted", "completed"] } }).select("eventDate eventDateOnly");
  return [...new Set(bookings.map((booking) => booking.eventDateOnly || booking.eventDate.toISOString().slice(0, 10)))].sort();
}

export async function assertVendorAvailable({ vendorId, dateOnly, excludeBookingId }) {
  const availability = await Availability.findOne({ vendorId });
  if (availability?.unavailableDates?.includes(dateOnly)) throw new ApiError(409, "Vendor is unavailable on this date.");
  const filter = { vendorId, status: { $in: ["accepted", "completed"] }, ...bookingDateFilter(dateOnly) };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  if (await Booking.exists(filter)) throw new ApiError(409, "Vendor already has a booking on this date.");
}
