import Payment from "../../models/Payment.js";
import { initializeBookingPayments } from "./paymentCalculationService.js";
import CancellationRequest from "../../models/CancellationRequest.js";

export const syncBookingPaymentState = async (booking, { session } = {}) => {
  initializeBookingPayments(booking);
  const payments = await Payment.find({ booking: booking._id }).session(session || null).sort({ createdAt: 1 });
  const captured = payments.filter((p) => ["captured", "partially_refunded", "refunded"].includes(p.status));
  const paid = captured.reduce((sum, p) => sum + p.amount, 0);
  const refunded = captured.reduce((sum, p) => sum + (p.refundedAmount || 0), 0);
  booking.totalPaidAmount = Math.max(0, paid - refunded); booking.refundAmount = refunded;
  booking.remainingAmount = Math.max(0, booking.totalAmount - booking.totalPaidAmount);
  if (paid > 0 && refunded >= paid) booking.paymentStatus = "refunded";
  else if (refunded > 0) booking.paymentStatus = "partially_refunded";
  else if (paid >= booking.totalAmount) booking.paymentStatus = "paid";
  else if (paid >= booking.depositAmount + booking.eventDayAmount) booking.paymentStatus = "partially_paid";
  else if (paid >= booking.depositAmount) booking.paymentStatus = "deposit_paid";
  else booking.paymentStatus = payments.some((p) => p.status === "failed") ? "failed" : "pending";
  if (booking.cancellationRequest) {
    const cancellation = await CancellationRequest.findById(booking.cancellationRequest).session(session || null);
    if (cancellation && ["approved", "processing", "partially_refunded"].includes(cancellation.refundStatus)) {
      if (refunded >= cancellation.refundAmount) cancellation.refundStatus = "refunded";
      else if (refunded > 0) cancellation.refundStatus = "partially_refunded";
      else cancellation.refundStatus = "processing";
      booking.refundStatus = cancellation.refundStatus;
      await cancellation.save({ session });
    }
  }
  const fee = Math.floor(booking.totalAmount * Number(process.env.PLATFORM_FEE_PERCENTAGE || 10) / 100);
  booking.platformFeeAmount = fee; booking.vendorPayoutAmount = Math.max(0, booking.totalAmount - fee - refunded - (booking.cancellationFeeAmount || 0));
  if (booking.paymentStatus === "paid" && booking.status === "completed" && booking.payoutStatus === "not_eligible") booking.payoutStatus = "pending";
  booking.paymentHistory = payments.map((p) => ({ paymentId: p._id, transactionId: p.transactionId, provider: p.provider, installmentType: p.installmentType, amount: p.amount, currency: p.currency, status: p.status, paymentMethod: p.paymentMethod, razorpayOrderId: p.providerOrderId, razorpayPaymentId: p.providerPaymentId, failureCode: p.failureCode, failureReason: p.failureReason, paidAt: p.paidAt, refundedAmount: p.refundedAmount, refundedAt: p.refundedAt, createdAt: p.createdAt }));
  const latest = payments.at(-1); if (latest?.transactionId) booking.latestTransactionId = latest.transactionId; if (latest?.paymentMethod) booking.paymentMethod = latest.paymentMethod;
  await booking.save({ session }); return booking;
};
