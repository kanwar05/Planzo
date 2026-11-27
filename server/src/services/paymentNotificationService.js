import NotificationOutbox, { PAYMENT_EMAIL_EVENTS } from "../models/NotificationOutbox.js";
import User from "../models/User.js";

export async function enqueuePaymentNotification({ booking, eventType, amountPaise, installment, eventId, session }) {
  if (!session?.inTransaction())
    throw new Error("Payment email intent must share the financial transaction.");
  if (!PAYMENT_EMAIL_EVENTS.includes(eventType) || !Number.isSafeInteger(amountPaise) || amountPaise < 0 ||
      !["deposit", "balance", "refund"].includes(installment))
    throw new Error("Unsupported payment notification.");
  const customer = await User.findById(booking.customerId).select("name email").session(session);
  const email = typeof customer?.email === "string" ? customer.email.trim().toLowerCase() : "";
  const recipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  return NotificationOutbox.create([{
    bookingId: booking._id,
    eventId,
    eventType,
    recipientUserId: customer?._id || booking.customerId,
    recipientEmail,
    payload: {
      customerName: typeof customer?.name === "string" ? customer.name.slice(0, 80) : "",
      eventType: typeof booking.eventType === "string" ? booking.eventType.slice(0, 120) : "",
      eventDateOnly: typeof booking.eventDateOnly === "string" ? booking.eventDateOnly : "",
      recipientRole: "customer",
      paymentAmountPaise: amountPaise,
      paymentStage: installment,
    },
    ...(!recipientEmail ? {
      status: "failed",
      nextAttemptAt: null,
      lastError: "Recipient email is unavailable.",
    } : {}),
  }], { session });
}
