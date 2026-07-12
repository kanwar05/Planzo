import crypto from "node:crypto";
import Booking from "../../models/Booking.js";
import Payment from "../../models/Payment.js";
import ApiError from "../../utils/ApiError.js";
import { getPaymentConfig } from "../../config/payment.js";
import { getPaymentProvider } from "./paymentProviderFactory.js";
import { amountForInstallment, initializeBookingPayments } from "./paymentCalculationService.js";
import { assertEligible, getEligibility } from "./paymentEligibilityService.js";
import { syncBookingPaymentState } from "./paymentStatusService.js";
import { ensureInvoiceNumber } from "./invoiceService.js";

const sequence = { booking_deposit: 1, event_day_payment: 2, final_payment: 3 };
export const createPaymentOrder = async ({ bookingId, installmentType, user }) => {
  const booking = await Booking.findById(bookingId); if (!booking) throw new ApiError(404, "Booking not found."); initializeBookingPayments(booking); await booking.save(); await assertEligible(booking, installmentType, user);
  const active = await Payment.findOne({ booking: booking._id, installmentType, status: { $in: ["created", "pending", "authorized"] }, expiresAt: { $gt: new Date() } });
  if (active?.providerOrderId) return { payment: active, order: { id: active.providerOrderId, amount: active.amount, currency: active.currency }, keyId: process.env.RAZORPAY_KEY_ID };
  const amount = amountForInstallment(booking, installmentType); const attempt = crypto.randomUUID(); const idempotencyKey = `${booking._id}:${installmentType}:${attempt}`;
  let payment;
  try { payment = await Payment.create({ booking: booking._id, customer: user._id, vendor: booking.vendorId, provider: getPaymentConfig().provider, currency: getPaymentConfig().currency, installmentType, installmentSequence: sequence[installmentType], amount, netAmount: amount, status: "created", idempotencyKey, expiresAt: new Date(Date.now() + 15 * 60000) }); } catch (e) { if (e.code === 11000) { const concurrent = await Payment.findOne({ booking: booking._id, installmentType, status: { $in: ["created", "pending", "authorized"] }, expiresAt: { $gt: new Date() } }); if (concurrent) return { payment: concurrent, order: concurrent.providerOrderId ? { id: concurrent.providerOrderId, amount: concurrent.amount, currency: concurrent.currency } : null, keyId: process.env.RAZORPAY_KEY_ID }; } throw e; }
  try { const order = await getPaymentProvider().createOrder({ amount, currency: payment.currency, receipt: String(payment._id), notes: { bookingId: String(booking._id), installmentType, paymentId: String(payment._id) } }); payment.providerOrderId = order.id; payment.status = "pending"; await payment.save(); return { payment, order, keyId: process.env.RAZORPAY_KEY_ID }; } catch (e) { payment.status = "failed"; payment.failedAt = new Date(); payment.failureReason = e.message; await payment.save(); await syncBookingPaymentState(booking); throw e; }
};

export const verifyPayment = async ({ bookingId, user, body }) => {
  const payment = await Payment.findOne({ booking: bookingId, providerOrderId: body.razorpay_order_id }); if (!payment) throw new ApiError(404, "Payment attempt not found.");
  if (String(payment.customer) !== String(user._id)) throw new ApiError(403, "You cannot verify this payment.");
  if (payment.status === "captured" && payment.providerPaymentId === body.razorpay_payment_id) return payment;
  if (!getPaymentProvider(payment.provider).verifyPayment({ orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature })) throw new ApiError(400, "Invalid payment signature.");
  payment.providerPaymentId = body.razorpay_payment_id; payment.providerSignature = body.razorpay_signature; payment.status = "authorized"; await payment.save();
  const providerPayment = await getPaymentProvider(payment.provider).fetchPayment(payment.providerPaymentId);
  if (Number(providerPayment.amount) !== payment.amount || providerPayment.order_id !== payment.providerOrderId) throw new ApiError(409, "Provider payment details do not match the order.");
  if (providerPayment.status === "captured") await capturePayment(payment, providerPayment);
  return payment;
};

export const capturePayment = async (payment, providerPayment = {}) => {
  if (payment.status === "captured") return payment; payment.status = "captured"; payment.providerPaymentId ||= providerPayment.id; payment.transactionId ||= providerPayment.id || `txn_${crypto.randomUUID()}`; payment.paymentMethod = providerPayment.method; payment.paidAt = providerPayment.created_at ? new Date(providerPayment.created_at * 1000) : new Date(); payment.netAmount = payment.amount - payment.refundedAmount; await ensureInvoiceNumber(payment); await payment.save(); const booking = await Booking.findById(payment.booking); await syncBookingPaymentState(booking); return payment;
};

export const paymentView = async (booking, user) => {
  initializeBookingPayments(booking); const payments = await Payment.find({ booking: booking._id }).sort({ createdAt: 1 });
  const stages = await Promise.all(Object.keys(sequence).map(async (type) => ({ installmentType: type, percentage: type === "booking_deposit" ? booking.depositPercentage : type === "event_day_payment" ? booking.eventDayPercentage : booking.finalPercentage, amount: amountForInstallment(booking, type), eligibility: await getEligibility(booking, type, user), payments: payments.filter((p) => p.installmentType === type).map((p) => ({ id: p._id, status: p.status, amount: p.amount, transactionId: p.transactionId, paymentMethod: p.paymentMethod, paidAt: p.paidAt, failureReason: p.failureReason, refundedAmount: p.refundedAmount, invoiceNumber: p.invoiceNumber })) })));
  return { booking: { id: booking._id, status: booking.status, paymentStatus: booking.paymentStatus, totalAmount: booking.totalAmount, totalPaidAmount: booking.totalPaidAmount, remainingAmount: booking.remainingAmount, refundAmount: booking.refundAmount, cancellationFeeAmount: booking.cancellationFeeAmount }, stages };
};
