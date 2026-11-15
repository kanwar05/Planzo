import { mock } from "node:test";
import Booking from "../../src/models/Booking.js";

// Advance only the JS Date clock: completion tests keep the original reservation
// date intact instead of editing a booking to bypass the lifecycle policy.
export async function afterEventDay(bookingId, operation) {
  const booking = await Booking.findById(bookingId);
  const nextDay = booking.eventDate.getTime() + 86400000;
  mock.timers.enable({ apis: ["Date"], now: Math.max(Date.now(), nextDay) });
  try {
    return await operation();
  } finally {
    mock.timers.reset();
  }
}
