import Payment from "../../models/Payment.js";
import ApiError from "../../utils/ApiError.js";
import { getPaymentConfig } from "../../config/payment.js";

const normal = ["booking_deposit", "event_day_payment", "final_payment"];
export const eventStart = (booking) => new Date(`${booking.eventDateOnly || new Date(booking.eventDate).toISOString().slice(0, 10)}T${booking.eventStartTime || "00:00"}:00+05:30`);
export const getEligibility = async (booking, type, user, now = new Date()) => {
  if (!normal.includes(type)) return { eligible: false, reason: "Invalid installment type." };
  if (String(booking.customerId?._id || booking.customerId) !== String(user._id) || user.role !== "customer") return { eligible: false, reason: "Only the booking customer can pay this installment.", statusCode: 403 };
  if (["cancelled", "rejected"].includes(booking.status) || ["refunded"].includes(booking.paymentStatus)) return { eligible: false, reason: "This booking is cancelled or refunded." };
  if (!booking.totalAmount) return { eligible: false, reason: "The booking has no confirmed amount." };
  const paid = await Payment.find({ booking: booking._id, status: "captured", installmentType: { $in: normal } }).distinct("installmentType");
  if (paid.includes(type)) return { eligible: false, reason: "This installment has already been paid." };
  if (type === "booking_deposit") return booking.status === "accepted" ? { eligible: true } : { eligible: false, reason: "The vendor must accept the booking first." };
  if (!paid.includes("booking_deposit")) return { eligible: false, reason: "Pay the booking confirmation installment first." };
  if (type === "event_day_payment") {
    if (booking.status !== "accepted") return { eligible: false, reason: "The booking is not active." };
    const opensAt = new Date(eventStart(booking).getTime() - getPaymentConfig().eventDayWindowHours * 3600000);
    return now >= opensAt ? { eligible: true, dueAt: eventStart(booking) } : { eligible: false, reason: `Payment opens ${getPaymentConfig().eventDayWindowHours} hours before the event.`, dueAt: eventStart(booking) };
  }
  if (!paid.includes("event_day_payment")) return { eligible: false, reason: "Pay the event-day installment first." };
  return booking.status === "completed" ? { eligible: true } : { eligible: false, reason: "The vendor must mark the event completed first." };
};
export const assertEligible = async (...args) => { const result = await getEligibility(...args); if (!result.eligible) throw new ApiError(result.statusCode || 409, result.reason); return result; };
