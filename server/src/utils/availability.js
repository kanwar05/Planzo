import Availability, {
  DEFAULT_BUSINESS_HOURS,
} from "../models/Availability.js";
import Booking from "../models/Booking.js";
import ApiError from "./ApiError.js";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_BOOKING_STATUSES = ["pending", "accepted"];

export function normalizeDateOnly(value, fieldName = "date") {
  if (typeof value === "string" && DATE_PATTERN.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `Please provide a valid ${fieldName}.`);
  }

  return date.toISOString().slice(0, 10);
}

export function assertTime(value, fieldName = "time") {
  if (!TIME_PATTERN.test(String(value))) {
    throw new ApiError(400, `${fieldName} must use HH:mm format.`);
  }

  return String(value);
}

export function timeToMinutes(value) {
  const [hours, minutes] = assertTime(value).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value) {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function assertTimeRange(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start >= end) {
    throw new ApiError(400, "Start time must be before end time.");
  }

  return { startTime, endTime, start, end };
}

export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function getDayOfWeek(dateOnly) {
  return new Date(`${dateOnly}T00:00:00.000Z`).getUTCDay();
}

export async function getOrCreateAvailability(vendorId) {
  return Availability.findOneAndUpdate(
    { vendorId },
    {
      $setOnInsert: {
        vendorId,
        businessHours: DEFAULT_BUSINESS_HOURS,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

function findBusinessHours(availability, dateOnly) {
  const dayOfWeek = getDayOfWeek(dateOnly);
  return availability.businessHours.find(
    (item) => item.dayOfWeek === dayOfWeek,
  );
}

function isInVacation(availability, dateOnly) {
  return availability.vacations.some(
    (vacation) =>
      vacation.startDate <= dateOnly && dateOnly <= vacation.endDate,
  );
}

function getDateBlock(availability, dateOnly) {
  return availability.blockedDates.find((block) => block.date === dateOnly);
}

export function isDateAvailable(availability, dateOnly) {
  const hours = findBusinessHours(availability, dateOnly);

  if (!hours?.isOpen) {
    return { available: false, reason: "Vendor is closed on this day." };
  }
  if (getDateBlock(availability, dateOnly)) {
    return { available: false, reason: "This date is blocked." };
  }
  if (isInVacation(availability, dateOnly)) {
    return { available: false, reason: "Vendor is away on vacation." };
  }

  return { available: true, hours };
}

export async function getBookedSlots(vendorId, dateOnly) {
  const dayStart = new Date(`${dateOnly}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  return Booking.find({
    vendorId,
    $or: [
      { eventDateOnly: dateOnly },
      {
        eventDateOnly: { $exists: false },
        eventDate: { $gte: dayStart, $lt: dayEnd },
      },
    ],
    status: { $in: ACTIVE_BOOKING_STATUSES },
  }).select("eventStartTime eventEndTime status");
}

export function buildAvailableSlots(availability, dateOnly, bookedSlots = []) {
  const dateAvailability = isDateAvailable(availability, dateOnly);
  if (!dateAvailability.available) return [];

  const { hours } = dateAvailability;
  const dayStart = timeToMinutes(hours.startTime);
  const dayEnd = timeToMinutes(hours.endTime);
  const duration = availability.slotDurationMinutes || 60;
  const blockedForDate = availability.blockedTimeSlots.filter(
    (slot) => slot.date === dateOnly,
  );

  const slots = [];
  for (let start = dayStart; start + duration <= dayEnd; start += duration) {
    const end = start + duration;
    const isBlocked = blockedForDate.some((slot) =>
      rangesOverlap(
        start,
        end,
        timeToMinutes(slot.startTime),
        timeToMinutes(slot.endTime),
      ),
    );
    const isBooked = bookedSlots.some((slot) => {
      if (!slot.eventStartTime || !slot.eventEndTime) return true;
      return rangesOverlap(
        start,
        end,
        timeToMinutes(slot.eventStartTime),
        timeToMinutes(slot.eventEndTime),
      );
    });

    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      available: !isBlocked && !isBooked,
      reason: isBooked ? "Booked" : isBlocked ? "Blocked" : "",
    });
  }

  return slots;
}

export async function assertVendorAvailable({
  vendorId,
  dateOnly,
  startTime,
  endTime,
}) {
  const availability = await getOrCreateAvailability(vendorId);
  const dateAvailability = isDateAvailable(availability, dateOnly);

  if (!dateAvailability.available) {
    throw new ApiError(409, dateAvailability.reason);
  }

  const range = assertTimeRange(startTime, endTime);
  const { hours } = dateAvailability;
  if (
    range.start < timeToMinutes(hours.startTime) ||
    range.end > timeToMinutes(hours.endTime)
  ) {
    throw new ApiError(409, "Requested time is outside vendor business hours.");
  }

  const blockedSlot = availability.blockedTimeSlots.find(
    (slot) =>
      slot.date === dateOnly &&
      rangesOverlap(
        range.start,
        range.end,
        timeToMinutes(slot.startTime),
        timeToMinutes(slot.endTime),
      ),
  );
  if (blockedSlot) {
    throw new ApiError(409, "Requested time slot is blocked.");
  }

  const bookings = await getBookedSlots(vendorId, dateOnly);
  const overlappingBooking = bookings.find((booking) => {
    if (!booking.eventStartTime || !booking.eventEndTime) return true;
    return rangesOverlap(
      range.start,
      range.end,
      timeToMinutes(booking.eventStartTime),
      timeToMinutes(booking.eventEndTime),
    );
  });

  if (overlappingBooking) {
    throw new ApiError(409, "Requested time slot is already booked.");
  }
}
