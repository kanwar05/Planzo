import Payment from "../../models/Payment.js"; import Booking from "../../models/Booking.js"; import ApiError from "../../utils/ApiError.js"; import { getPaymentProvider } from "./paymentProviderFactory.js";
export const initiateRefund = async ({ paymentId, amount, reason, admin }) => { const payment = await Payment.findById(paymentId); if (!payment) throw new ApiError(404, "Payment not found."); if (!["captured", "partially_refunded"].includes(payment.status)) throw new ApiError(409, "Only captured payments can be refunded."); if (!Number.isSafeInteger(amount) || amount <= 0 || amount > payment.amount - payment.refundedAmount) throw new ApiError(400, "Refund amount exceeds the refundable balance."); if (!reason?.trim()) throw new ApiError(400, "Refund reason is required."); const result = await getPaymentProvider(payment.provider).refundPayment(payment.providerPaymentId, { amount, notes: { reason: reason.trim(), paymentId: String(payment._id) } }); payment.refunds.push({ refundId: result.id, providerRefundId: result.id, amount, reason: reason.trim(), status: result.status || "pending", initiatedBy: admin._id }); await payment.save(); const booking = await Booking.findById(payment.booking); booking.refundReason = reason.trim(); await booking.save(); return payment; };

export const initiateBookingRefund = async ({ bookingId, amount, reason, admin }) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ApiError(400, "Refund amount must be a positive integer.");
  const payments = await Payment.find({ booking: bookingId, status: { $in: ["captured", "partially_refunded"] } }).sort({ paidAt: -1 });
  const available = payments.reduce((sum, payment) => sum + payment.amount - payment.refundedAmount, 0);
  if (amount > available) throw new ApiError(409, "Calculated refund exceeds captured payment balance.");
  let remaining = amount; const initiated = [];
  for (const payment of payments) {
    if (!remaining) break;
    const portion = Math.min(remaining, payment.amount - payment.refundedAmount);
    initiated.push(await initiateRefund({ paymentId: payment._id, amount: portion, reason, admin }));
    remaining -= portion;
  }
  return initiated;
};
