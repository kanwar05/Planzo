import NotificationOutbox, { BOOKING_EMAIL_EVENTS } from "../models/NotificationOutbox.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import { validateEmail } from "../utils/validation.js";

const id = (value) => value?._id || value || null;
const snapshotText = (value, limit) => typeof value === "string" ? value.slice(0, limit) : "";
function snapshotEmail(value) {
  if (typeof value !== "string") return "";
  try {
    validateEmail(value);
    return value.trim().toLowerCase();
  } catch {
    return "";
  }
}

export async function enqueueBookingEmails({ booking, eventType, eventId, session }) {
  if (!session?.inTransaction())
    throw new Error("Booking email intent must share the booking transaction.");
  if (!BOOKING_EMAIL_EVENTS.includes(eventType))
    throw new Error("Unsupported booking email event.");

  // Read only the fields needed for routing/snapshotting, in the same session.
  const vendor = await Vendor.findById(id(booking.vendorId))
    .select("userId businessName serviceCategory").session(session);
  const customer = await User.findById(id(booking.customerId))
    .select("name email").session(session);
  const vendorOwner = await User.findById(id(vendor?.userId))
    .select("email").session(session);
  const targets = eventType === "booking_requested"
    ? [{ userId: id(vendor?.userId), user: vendorOwner, role: "vendor" }]
    : eventType === "booking_cancelled"
      ? [
        { userId: id(booking.customerId), user: customer, role: "customer" },
        { userId: id(vendor?.userId), user: vendorOwner, role: "vendor" },
      ]
      : [{ userId: id(booking.customerId), user: customer, role: "customer" }];
  const payload = {
    customerName: snapshotText(customer?.name, 80),
    vendorName: snapshotText(vendor?.businessName, 120),
    service: snapshotText(vendor?.serviceCategory, 120),
    eventType: snapshotText(booking.eventType, 120),
    eventDateOnly: snapshotText(booking.eventDateOnly, 10),
    eventLocation: snapshotText(booking.eventLocation, 300),
  };
  const seen = new Set();
  const records = [];
  for (const target of targets) {
    const recipientKey = String(target.userId);
    if (seen.has(recipientKey)) continue;
    seen.add(recipientKey);
    const recipientEmail = snapshotEmail(target.user?.email);
    records.push({
      bookingId: booking._id, eventId, eventType,
      recipientUserId: target.userId, recipientEmail,
      payload: { ...payload, recipientRole: target.role },
      ...(!recipientEmail ? {
        status: "failed", nextAttemptAt: null,
        lastError: "Recipient email is unavailable.",
      } : {}),
    });
  }
  // A write failure must abort the booking mutation; never silently lose intent.
  return NotificationOutbox.insertMany(records, { session });
}
