import { createHash } from "node:crypto";
import Booking from "../models/Booking.js";
import FinancialTransaction from "../models/FinancialTransaction.js";
import Payment from "../models/Payment.js";
import PaymentReconciliationException from "../models/PaymentReconciliationException.js";
import PaymentWebhookEvent from "../models/PaymentWebhookEvent.js";
import Refund from "../models/Refund.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { lockAccountForBooking, withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { enqueuePaymentNotification } from "./paymentNotificationService.js";
import {
  getRazorpayProvider,
  razorpayConfiguration,
  verifyCheckoutSignature,
} from "./razorpayProvider.js";

const HASH = value => createHash("sha256").update(value).digest("hex");
const MAX_AMOUNT = 100_000_000_000;
const same = (left, right) => String(left?._id || left || "") === String(right?._id || right || "");
const fail = (status, message) => new ApiError(status, message);

function idempotencyHash(key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(key))
    throw fail(400, "Provide an Idempotency-Key of 16 to 128 safe ASCII characters.");
  return HASH(key);
}

function integerAmount(value, field) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_AMOUNT)
    throw fail(400, `${field} must be an integer INR paise amount.`);
  return value;
}

export function paymentSettings(env = process.env) {
  const depositBps = Number(env.PAYMENT_DEPOSIT_BPS ?? 3000);
  const commissionBps = Number(env.PLATFORM_COMMISSION_BPS ?? 0);
  if (!Number.isSafeInteger(depositBps) || depositBps < 1 || depositBps > 10000 ||
      !Number.isSafeInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000)
    throw fail(503, "Payment configuration is invalid.");
  return { depositBps, commissionBps };
}

export function paymentView(payment) {
  if (!payment) return null;
  return {
    _id: String(payment._id),
    bookingId: String(payment.bookingId),
    installment: payment.installment,
    status: payment.status,
    amountPaise: payment.amountPaise,
    capturedAmountPaise: payment.capturedAmountPaise,
    refundedAmountPaise: payment.refundedAmountPaise,
    currency: payment.currency,
    commissionAmountPaise: payment.commissionAmountPaise,
    vendorPayablePaise: payment.vendorPayablePaise,
    settlementStatus: payment.settlementStatus,
    providerOrderId: payment.providerOrderId || null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    attempts: (payment.attempts || []).map(attempt => ({
      status: attempt.status,
      amountPaise: attempt.amountPaise,
      currency: attempt.currency,
      failureCode: attempt.failureCode || "",
      updatedAt: attempt.updatedAt,
    })),
  };
}

export function refundView(refund) {
  if (!refund) return null;
  return {
    _id: String(refund._id),
    paymentId: String(refund.paymentId),
    bookingId: String(refund.bookingId),
    amountPaise: refund.amountPaise,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason,
    createdAt: refund.createdAt,
    processedAt: refund.processedAt,
  };
}

async function assertCustomerBooking(bookingId, actor, session = null) {
  const booking = await Booking.findById(bookingId).session(session);
  if (!booking) throw fail(404, "Booking not found.");
  if (actor.role !== "customer" || !same(booking.customerId, actor))
    throw fail(403, "You cannot access payments for this booking.");
  return booking;
}

function installmentAmount(booking, installment, depositBps) {
  const total = booking.acceptedAgreement?.totalAmount;
  if (!Number.isSafeInteger(total) || total < 1 || total > MAX_AMOUNT)
    throw fail(409, "This accepted quotation cannot be paid online.");
  const deposit = Math.min(total, Math.max(1, Math.round(total * depositBps / 10000)));
  if (installment === "deposit") return deposit;
  if (installment !== "balance") throw fail(400, "Choose a valid payment installment.");
  return total - deposit;
}

async function createLedger(input, session) {
  const exists = await FinancialTransaction.findOne({ eventKey: input.eventKey }).session(session);
  if (exists) return exists;
  const [record] = await FinancialTransaction.create([input], { session });
  return record;
}

async function saveException({ fingerprint, reason, bookingId, paymentId, providerEventId }, session) {
  return PaymentReconciliationException.updateOne({ fingerprint }, {
    $setOnInsert: { fingerprint, reason, bookingId, paymentId, providerEventId },
  }, { upsert: true, session });
}

export async function createPaymentOrder(bookingId, actor, installment, key) {
  const requestKeyHash = idempotencyHash(key);
  const { depositBps, commissionBps } = paymentSettings();
  const config = razorpayConfiguration();
  if (!config) throw fail(503, "Online payments are not configured.");
  const requestHash = HASH(JSON.stringify({ bookingId, installment }));
  let payment;
  let shouldCreateProviderOrder = false;
  try {
    ({ payment, shouldCreateProviderOrder } = await withBookingTransaction(async session => {
      const currentUser = await lockAccountForBooking(actor._id, session);
      if (currentUser.role !== "customer" || (currentUser.authVersion || 0) !== (actor.authVersion || 0))
        throw fail(401, "Your account changed. Please sign in again.");
      assertVerifiedEmail(currentUser);
      const booking = await assertCustomerBooking(bookingId, actor, session);
      if (booking.status !== "accepted" || !booking.acceptedAgreement ||
          booking.quotationStatus !== "accepted")
        throw fail(409, "Payments are available only for bookings with an accepted quotation.");
      const amountPaise = installmentAmount(booking, installment, depositBps);
      if (amountPaise < 1) throw fail(409, "No remaining balance is due for this booking.");
      if (installment === "balance") {
        const deposit = await Payment.findOne({ bookingId, installment: "deposit" }).session(session);
        if (!deposit || deposit.status !== "captured" || deposit.capturedAmountPaise < deposit.amountPaise)
          throw fail(409, "Pay the deposit before paying the remaining balance.");
      }

      const previousKey = await Payment.findOne({ customerId: actor._id, idempotencyKeyHash: requestKeyHash })
        .select("+requestHash").session(session);
      if (previousKey) {
        if (previousKey.requestHash !== requestHash)
          throw fail(409, "This Idempotency-Key was already used for a different payment.");
        return { payment: previousKey, shouldCreateProviderOrder: false };
      }
      const existing = await Payment.findOne({ bookingId, installment }).session(session);
      if (existing) {
        if (existing.amountPaise !== amountPaise)
          throw fail(409, "The payment amount changed. Contact support before retrying.");
        if (existing.status === "creating" &&
            Date.now() - existing.createdAt.getTime() > 10 * 60 * 1000) {
          existing.status = "reconciliation_required";
          await existing.save({ session });
          const fingerprint = `stale-order-create:${existing._id}`;
          await saveException({ fingerprint, reason: "provider_timeout", bookingId, paymentId: existing._id }, session);
        }
        return { payment: existing, shouldCreateProviderOrder: false };
      }

      const commissionAmountPaise = Math.floor(amountPaise * commissionBps / 10000);
      const [created] = await Payment.create([{
        bookingId,
        customerId: actor._id,
        vendorId: booking.vendorId,
        installment,
        status: "creating",
        amountPaise,
        commissionBps,
        commissionAmountPaise,
        vendorPayablePaise: amountPaise - commissionAmountPaise,
        idempotencyKeyHash: requestKeyHash,
        requestHash,
        ...(booking.acceptedAgreement.cancellationPolicy
          ? { cancellationPolicySnapshot: booking.acceptedAgreement.cancellationPolicy } : {}),
      }], { session });
      return { payment: created, shouldCreateProviderOrder: true };
    }));
  } catch (error) {
    if (error.code !== 11000) throw error;
    const [existing, keyUse] = await Promise.all([
      Payment.findOne({ bookingId, installment }),
      Payment.findOne({ customerId: actor._id, idempotencyKeyHash: requestKeyHash }).select("+requestHash"),
    ]);
    if (keyUse && keyUse.requestHash !== requestHash)
      throw fail(409, "This Idempotency-Key was already used for a different payment.");
    if (!existing) throw fail(409, "A concurrent payment request is being finalized.");
    payment = existing;
  }

  if (!shouldCreateProviderOrder) {
    if (payment.status === "creating")
      throw fail(409, "Payment order creation is in progress. Retry shortly.");
    return { payment: paymentView(payment), keyId: config.keyId, replayed: true };
  }

  let order;
  try {
    order = await getRazorpayProvider().createOrder({
      amountPaise: payment.amountPaise,
      receipt: `pz-${String(payment._id)}`,
      notes: { paymentId: String(payment._id), bookingId: String(payment.bookingId), installment },
    });
  } catch (error) {
    await withBookingTransaction(async session => {
      const current = await Payment.findById(payment._id).session(session);
      if (!current || current.status !== "creating") return;
      current.status = "reconciliation_required";
      await current.save({ session });
      const fingerprint = `order-create:${current._id}`;
      await saveException({ fingerprint, reason: "provider_timeout", bookingId, paymentId: current._id }, session);
      await createLedger({
        eventKey: `reconciliation:${fingerprint}`,
        kind: "reconciliation_exception",
        bookingId,
        paymentId: current._id,
        amountPaise: 0,
        recordedAt: new Date(),
        note: "Razorpay order creation outcome requires reconciliation.",
      }, session);
    });
    throw error;
  }

  const persisted = await withBookingTransaction(async session => {
    const current = await Payment.findOneAndUpdate({
      _id: payment._id,
      status: "creating",
      providerOrderId: { $exists: false },
    }, {
      $set: { status: "created", providerOrderId: order.id },
    }, { new: true, session, runValidators: true });
    if (!current) throw fail(409, "Payment order was already finalized. Refresh payment history.");
    await createLedger({
      eventKey: `payment-order:${current._id}`,
      kind: "order_created",
      bookingId,
      paymentId: current._id,
      amountPaise: current.amountPaise,
      recordedAt: new Date(),
    }, session);
    return current;
  });
  return { payment: paymentView(persisted), keyId: config.keyId, replayed: false };
}

async function addProviderAttempt(providerPayment, { session, eventId, source }) {
  const payment = await Payment.findOne({ providerOrderId: providerPayment.orderId }).session(session);
  if (!payment) {
    const fingerprint = `unmatched-payment:${providerPayment.id}`;
    await saveException({ fingerprint, reason: "unmatched_provider_event", providerEventId: eventId }, session);
    return { outcome: "unmatched" };
  }
  const booking = await Booking.findById(payment.bookingId).session(session);
  const eventKey = `provider-payment:${providerPayment.id}:${providerPayment.status}`;
  if (await FinancialTransaction.exists({ eventKey }).session(session))
    return { outcome: "duplicate", payment };
  if (providerPayment.currency !== payment.currency) {
    payment.status = "reconciliation_required";
    await payment.save({ session });
    const fingerprint = `currency-mismatch:${providerPayment.id}`;
    await saveException({ fingerprint, reason: "currency_mismatch", bookingId: payment.bookingId, paymentId: payment._id, providerEventId: eventId }, session);
    return { outcome: "exception", payment };
  }

  const previousAttempt = payment.attempts.find(item => item.providerPaymentId === providerPayment.id);
  if (previousAttempt && previousAttempt.status === providerPayment.status)
    return { outcome: "duplicate", payment };
  const previousAttemptStatus = previousAttempt?.status;
  const attempt = {
    providerPaymentId: providerPayment.id,
    status: providerPayment.status,
    amountPaise: providerPayment.amountPaise,
    currency: providerPayment.currency,
    failureCode: providerPayment.errorCode || "",
    updatedAt: new Date(),
  };
  if (previousAttempt) Object.assign(previousAttempt, attempt);
  else payment.attempts.push(attempt);

  let kind;
  const amountMismatch = providerPayment.amountPaise !== payment.amountPaise;
  if (amountMismatch) {
    payment.status = "reconciliation_required";
    payment.settlementStatus = "held";
    if (providerPayment.status === "captured" &&
        Number.isSafeInteger(payment.capturedAmountPaise + providerPayment.amountPaise) &&
        payment.capturedAmountPaise + providerPayment.amountPaise <= MAX_AMOUNT)
      payment.capturedAmountPaise += providerPayment.amountPaise;
    const fingerprint = `amount-mismatch:${providerPayment.id}`;
    await saveException({ fingerprint, reason: "amount_mismatch", bookingId: payment.bookingId, paymentId: payment._id, providerEventId: eventId }, session);
    kind = "reconciliation_exception";
  } else if (providerPayment.status === "captured") {
    if (payment.capturedAmountPaise > 0) {
      payment.status = "reconciliation_required";
      if (Number.isSafeInteger(payment.capturedAmountPaise + providerPayment.amountPaise) &&
          payment.capturedAmountPaise + providerPayment.amountPaise <= MAX_AMOUNT)
        payment.capturedAmountPaise += providerPayment.amountPaise;
      const fingerprint = `duplicate-capture:${providerPayment.id}`;
      await saveException({ fingerprint, reason: "duplicate_capture", bookingId: payment.bookingId, paymentId: payment._id, providerEventId: eventId }, session);
      kind = "reconciliation_exception";
    } else {
      payment.capturedAmountPaise = providerPayment.amountPaise;
      payment.status = "captured";
      payment.settlementStatus = booking?.status === "completed" ? "payable" : "held";
      kind = "payment_captured";
      if (booking?.status !== "accepted" && booking?.status !== "completed") {
        const fingerprint = `booking-state-after-order:${payment._id}`;
        await saveException({ fingerprint, reason: "booking_state_changed_after_order", bookingId: payment.bookingId, paymentId: payment._id, providerEventId: eventId }, session);
      }
    }
  } else if (providerPayment.status === "authorized") {
    if (!["captured", "partially_refunded", "refunded", "reconciliation_required"].includes(payment.status))
      payment.status = "authorized";
    kind = "payment_authorized";
  } else {
    if (!["captured", "partially_refunded", "refunded", "reconciliation_required"].includes(payment.status))
      payment.status = "failed";
    kind = "payment_failed";
  }
  await payment.save({ session });
  await createLedger({
    eventKey,
    kind,
    bookingId: payment.bookingId,
    paymentId: payment._id,
    ...(eventId ? { providerEventId: eventId } : {}),
    amountPaise: providerPayment.amountPaise,
    recordedAt: new Date(),
    note: amountMismatch
      ? "Provider payment amount differs from the accepted payment obligation."
      : source === "webhook" ? "" : "Confirmed using Razorpay server-to-server payment lookup.",
  }, session);
  if (providerPayment.status === "captured" && booking && previousAttemptStatus !== "captured")
    await enqueuePaymentNotification({
      booking, eventType: "payment_succeeded", amountPaise: providerPayment.amountPaise,
      installment: payment.installment, eventId: `payment-success-${providerPayment.id}`, session,
    });
  if (kind === "payment_failed" && payment.status === "failed" && booking && previousAttemptStatus !== "failed")
    await enqueuePaymentNotification({
      booking, eventType: "payment_failed", amountPaise: providerPayment.amountPaise,
      installment: payment.installment, eventId: `payment-failed-${providerPayment.id}`, session,
    });
  return { outcome: "processed", payment };
}

export async function verifyCheckoutPayment(actor, { orderId, paymentId, signature }) {
  const config = razorpayConfiguration();
  if (!config) throw fail(503, "Online payments are not configured.");
  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment) throw fail(404, "Payment order not found.");
  if (!same(payment.customerId, actor) || actor.role !== "customer")
    throw fail(403, "You cannot verify this payment.");
  if (!verifyCheckoutSignature(orderId, paymentId, signature, config.keySecret))
    throw fail(400, "Payment signature verification failed.");
  const providerPayment = await getRazorpayProvider().fetchPayment(paymentId);
  if (providerPayment.orderId !== orderId || providerPayment.amountPaise !== payment.amountPaise ||
      providerPayment.currency !== payment.currency)
    throw fail(409, "Payment details do not match the recorded order.");
  const result = await withBookingTransaction(session =>
    addProviderAttempt(providerPayment, { session, source: "checkout" }));
  return {
    payment: paymentView(result.payment),
    confirmed: result.payment?.status === "captured" || result.payment?.status === "partially_refunded" || result.payment?.status === "refunded",
  };
}

export async function recordWebhookPayment(providerPayment, eventId) {
  return withBookingTransaction(session =>
    addProviderAttempt(providerPayment, { session, eventId, source: "webhook" }));
}

async function settleRefund(refundId, state, providerRefundId = undefined, eventId = undefined) {
  return withBookingTransaction(async session => {
    const refund = await Refund.findById(refundId).session(session);
    if (!refund || refund.status === "processed" || refund.status === "failed") return refund;
    const payment = await Payment.findById(refund.paymentId).session(session);
    if (!payment) throw fail(404, "Payment not found for refund.");
    if (providerRefundId) refund.providerRefundId = providerRefundId;
    if (state === "processed") {
      refund.status = "processed";
      refund.processedAt = new Date();
      payment.pendingRefundAmountPaise = Math.max(0, payment.pendingRefundAmountPaise - refund.amountPaise);
      payment.refundedAmountPaise += refund.amountPaise;
      payment.status = payment.refundedAmountPaise >= payment.capturedAmountPaise ? "refunded" : "partially_refunded";
      if (payment.status === "refunded") payment.settlementStatus = "held";
      await payment.save({ session });
      await refund.save({ session });
      await createLedger({
        eventKey: `refund-processed:${refund._id}`,
        kind: "refund_processed",
        bookingId: refund.bookingId,
        paymentId: payment._id,
        refundId: refund._id,
        ...(eventId ? { providerEventId: eventId } : {}),
        amountPaise: refund.amountPaise,
        recordedAt: new Date(),
        actorId: refund.requestedById,
      }, session);
      const booking = await Booking.findById(refund.bookingId).session(session);
      if (booking) await enqueuePaymentNotification({
        booking, eventType: "refund_processed", amountPaise: refund.amountPaise,
        installment: "refund", eventId: `refund-success-${refund._id}`, session,
      });
    } else {
      refund.status = "failed";
      payment.pendingRefundAmountPaise = Math.max(0, payment.pendingRefundAmountPaise - refund.amountPaise);
      await payment.save({ session });
      await refund.save({ session });
      await createLedger({
        eventKey: `refund-failed:${refund._id}`,
        kind: "refund_failed",
        bookingId: refund.bookingId,
        paymentId: payment._id,
        refundId: refund._id,
        ...(eventId ? { providerEventId: eventId } : {}),
        amountPaise: refund.amountPaise,
        recordedAt: new Date(),
        actorId: refund.requestedById,
      }, session);
      const booking = await Booking.findById(refund.bookingId).session(session);
      if (booking) await enqueuePaymentNotification({
        booking, eventType: "refund_failed", amountPaise: refund.amountPaise,
        installment: "refund", eventId: `refund-failed-${refund._id}`, session,
      });
    }
    return refund;
  });
}

export async function createAdminRefund(paymentId, actor, body, key) {
  if (actor.role !== "admin") throw fail(403, "Only administrators may create refunds.");
  const amountPaise = integerAmount(body?.amountPaise, "Refund amount");
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) throw fail(400, "Provide an administrator refund reason.");
  if (Object.keys(body || {}).some(field => !["amountPaise", "reason"].includes(field)))
    throw fail(400, "Unsupported refund fields.");
  const requestKeyHash = idempotencyHash(key);
  const requestHash = HASH(JSON.stringify({ paymentId, amountPaise, reason }));
  let refund;
  let shouldSend = false;
  try {
    ({ refund, shouldSend } = await withBookingTransaction(async session => {
      const currentAdmin = await lockAccountForBooking(actor._id, session);
      if (currentAdmin.role !== "admin" || (currentAdmin.authVersion || 0) !== (actor.authVersion || 0))
        throw fail(401, "Your account changed. Please sign in again.");
      const previous = await Refund.findOne({ paymentId, idempotencyKeyHash: requestKeyHash }).select("+requestHash").session(session);
      if (previous) {
        if (previous.requestHash !== requestHash) throw fail(409, "This Idempotency-Key was already used for another refund.");
        return { refund: previous, shouldSend: false };
      }
      const payment = await Payment.findById(paymentId).session(session);
      if (!payment || !["captured", "partially_refunded", "reconciliation_required"].includes(payment.status) ||
          payment.capturedAmountPaise < 1)
        throw fail(409, "Only captured payments can be refunded.");
      const available = payment.capturedAmountPaise - payment.refundedAmountPaise - payment.pendingRefundAmountPaise;
      if (amountPaise > available) throw fail(409, "Refund exceeds the remaining captured amount.");
      const booking = await Booking.findById(payment.bookingId).session(session);
      const [created] = await Refund.create([{
        paymentId: payment._id,
        bookingId: payment.bookingId,
        customerId: payment.customerId,
        requestedById: actor._id,
        amountPaise,
        reason,
        ...(booking?.acceptedAgreement?.cancellationPolicy
          ? { cancellationPolicySnapshot: booking.acceptedAgreement.cancellationPolicy } : {}),
        ...(booking?.cancellation ? { cancellationRecordSnapshot: booking.cancellation } : {}),
        idempotencyKeyHash: requestKeyHash,
        requestHash,
      }], { session });
      payment.pendingRefundAmountPaise += amountPaise;
      payment.settlementStatus = "held";
      await payment.save({ session });
      await createLedger({
        eventKey: `refund-requested:${created._id}`,
        kind: "refund_requested",
        bookingId: payment.bookingId,
        paymentId: payment._id,
        refundId: created._id,
        amountPaise,
        recordedAt: new Date(),
        actorId: actor._id,
        note: reason,
      }, session);
      return { refund: created, shouldSend: true };
    }));
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await Refund.findOne({ paymentId, idempotencyKeyHash: requestKeyHash }).select("+requestHash");
    if (!existing || existing.requestHash !== requestHash)
      throw fail(409, "A concurrent refund request is being finalized.");
    refund = existing;
  }
  if (!shouldSend) return { refund: refundView(refund), replayed: true };

  const payment = await Payment.findById(paymentId);
  const capturedAttempt = payment?.attempts.find(attempt => attempt.status === "captured");
  if (!capturedAttempt) throw fail(409, "No captured provider payment is available for refund.");
  try {
    const providerRefund = await getRazorpayProvider().createRefund({
      paymentId: capturedAttempt.providerPaymentId,
      amountPaise,
      refundId: refund._id,
    });
    await Refund.updateOne({ _id: refund._id }, {
      $set: { providerRefundId: providerRefund.id },
    });
    if (providerRefund.status === "processed")
      refund = await settleRefund(refund._id, "processed", providerRefund.id);
    else if (providerRefund.status === "failed")
      refund = await settleRefund(refund._id, "failed", providerRefund.id);
    else
      refund = await Refund.findById(refund._id);
  } catch (error) {
    await withBookingTransaction(async session => {
      await Refund.updateOne({ _id: refund._id, status: "processing" }, {
        $set: { status: "reconciliation_required" },
      }, { session });
      await saveException({
        fingerprint: `refund-provider-outcome:${refund._id}`,
        reason: "provider_timeout",
        bookingId: refund.bookingId,
        paymentId,
      }, session);
    });
    throw error;
  }
  return { refund: refundView(refund), replayed: false };
}

export async function recordProviderRefund({ providerRefundId, providerPaymentId, amountPaise, status }, eventId) {
  return withBookingTransaction(async session => {
    const refund = await Refund.findOne({
      $or: [
        { providerRefundId },
        ...( /^[a-f0-9]{24}$/i.test(String(providerRefundId))
          ? [{ _id: providerRefundId }] : []),
      ],
    }).session(session);
    if (!refund) {
      const payment = await Payment.findOne({ "attempts.providerPaymentId": providerPaymentId }).session(session);
      const fingerprint = `unmatched-refund:${providerRefundId}`;
      await saveException({
        fingerprint,
        reason: "unmatched_provider_event",
        bookingId: payment?.bookingId,
        paymentId: payment?._id,
        providerEventId: eventId,
      }, session);
      return { outcome: "unmatched" };
    }
    if (refund.amountPaise !== amountPaise) {
      await saveException({
        fingerprint: `refund-mismatch:${providerRefundId}`,
        reason: "refund_mismatch",
        bookingId: refund.bookingId,
        paymentId: refund.paymentId,
        providerEventId: eventId,
      }, session);
      return { outcome: "exception", refund };
    }
    if (!refund.providerRefundId) refund.providerRefundId = providerRefundId;
    await refund.save({ session });
    await applyRefundTransition(refund, status, providerRefundId, eventId, session);
    return { outcome: "processed", refund };
  });
}

export async function getCustomerPaymentHistory(bookingId, actor) {
  await assertCustomerBooking(bookingId, actor);
  const [payments, refunds] = await Promise.all([
    Payment.find({ bookingId, customerId: actor._id }).sort({ createdAt: 1 }),
    Refund.find({ bookingId, customerId: actor._id }).sort({ createdAt: -1 }),
  ]);
  return {
    payments: payments.map(paymentView),
    refunds: refunds.map(refundView),
  };
}

export async function getPaymentForCustomer(paymentId, actor) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw fail(404, "Payment not found.");
  if (actor.role !== "customer" || !same(payment.customerId, actor))
    throw fail(403, "You cannot access this payment.");
  return payment;
}

export async function processPaymentWebhookEvent({ eventId, eventType, payloadHash, entity, providerPayments = [] }) {
  return withBookingTransaction(async session => {
    let event = await PaymentWebhookEvent.findOne({ eventKey: eventId }).session(session);
    if (event && event.payloadHash !== payloadHash) {
      const fingerprint = `webhook-id-reused:${eventId}`;
      await saveException({
        fingerprint,
        reason: "unmatched_provider_event",
        providerEventId: eventId,
      }, session);
      event.status = "unmatched";
      event.failureCode = "event_id_payload_mismatch";
      await event.save({ session });
      return { duplicate: false, status: "unmatched", outcome: "event_id_payload_mismatch" };
    }
    if (event?.status === "processed" || event?.status === "unmatched")
      return { duplicate: true, status: event.status };
    if (!event) {
      [event] = await PaymentWebhookEvent.create([{
        eventKey: eventId, eventType, payloadHash, receivedAt: new Date(),
      }], { session });
    }
    event.deliveryAttempts += 1;
    let result;
    if (eventType === "payment.captured" || eventType === "payment.authorized" || eventType === "payment.failed") {
      if (!entity || typeof entity.id !== "string" || typeof entity.order_id !== "string" ||
          !Number.isSafeInteger(entity.amount) || entity.amount < 1 || entity.amount > MAX_AMOUNT ||
          entity.currency !== "INR")
        throw fail(400, "Payment webhook entity is invalid.");
      result = await addProviderAttempt({
        id: entity.id,
        orderId: entity.order_id,
        amountPaise: entity.amount,
        currency: entity.currency,
        status: eventType === "payment.captured" ? "captured" : eventType === "payment.authorized" ? "authorized" : "failed",
        errorCode: typeof entity.error_code === "string" ? entity.error_code.slice(0, 80) : "",
      }, { session, eventId, source: "webhook" });
    } else if (["refund.created", "refund.processed", "refund.failed"].includes(eventType)) {
      if (!entity || typeof entity.id !== "string" || typeof entity.payment_id !== "string" ||
          !Number.isSafeInteger(entity.amount) || entity.amount < 1 || entity.amount > MAX_AMOUNT)
        throw fail(400, "Refund webhook entity is invalid.");
      const noteRefundId = entity.notes?.planzo_refund_id;
      const refund = await Refund.findOne({
        $or: [
          { providerRefundId: entity.id },
          ...(typeof noteRefundId === "string" && /^[a-f0-9]{24}$/i.test(noteRefundId)
            ? [{ _id: noteRefundId }] : []),
        ],
      }).session(session);
      if (!refund) {
        const payment = await Payment.findOne({ "attempts.providerPaymentId": entity.payment_id }).session(session);
        await saveException({
          fingerprint: `unmatched-refund:${entity.id}`,
          reason: "unmatched_provider_event",
          bookingId: payment?.bookingId,
          paymentId: payment?._id,
          providerEventId: eventId,
        }, session);
        result = { outcome: "unmatched" };
      } else if (refund.amountPaise !== entity.amount) {
        await saveException({
          fingerprint: `refund-mismatch:${entity.id}`,
          reason: "refund_mismatch",
          bookingId: refund.bookingId,
          paymentId: refund.paymentId,
          providerEventId: eventId,
        }, session);
        result = { outcome: "exception" };
      } else if (eventType === "refund.processed") {
        if (!refund.providerRefundId) {
          refund.providerRefundId = entity.id;
          await refund.save({ session });
        }
        await applyRefundTransition(refund, "processed", entity.id, eventId, session);
        result = { outcome: "processed" };
      } else if (eventType === "refund.failed") {
        if (!refund.providerRefundId) {
          refund.providerRefundId = entity.id;
          await refund.save({ session });
        }
        await applyRefundTransition(refund, "failed", entity.id, eventId, session);
        result = { outcome: "processed" };
      } else {
        if (!refund.providerRefundId) {
          refund.providerRefundId = entity.id;
          await refund.save({ session });
        }
        result = { outcome: "processed" };
      }
    } else if (eventType === "order.paid") {
      const order = entity;
      if (order && typeof order.id === "string") {
        const payment = await Payment.findOne({ providerOrderId: order.id }).session(session);
        if (!payment || order.amount_paid !== payment.amountPaise) {
          await saveException({
            fingerprint: `order-paid:${eventId}`,
            reason: payment ? "amount_mismatch" : "unmatched_provider_event",
            bookingId: payment?.bookingId,
            paymentId: payment?._id,
            providerEventId: eventId,
          }, session);
          result = { outcome: "unmatched" };
        } else {
          const captured = providerPayments.filter(item =>
            item.orderId === order.id && item.status === "captured");
          if (!captured.length) {
            const fingerprint = `order-paid-no-capture:${eventId}`;
            await saveException({
              fingerprint,
              reason: "unmatched_provider_event",
              bookingId: payment.bookingId,
              paymentId: payment._id,
              providerEventId: eventId,
            }, session);
            result = { outcome: "unmatched" };
          } else {
            for (const providerPayment of captured)
              await addProviderAttempt(providerPayment, { session, eventId, source: "webhook" });
            result = { outcome: "processed" };
          }
        }
      } else throw fail(400, "Order webhook entity is invalid.");
    } else {
      result = { outcome: "processed" };
    }
    const unmatched = result?.outcome === "unmatched";
    event.status = unmatched
      ? event.deliveryAttempts >= 5 ? "unmatched" : "received"
      : "processed";
    event.processedAt = unmatched && event.status === "received" ? null : new Date();
    await event.save({ session });
    return {
      duplicate: false,
      status: unmatched ? "unmatched" : event.status,
      outcome: result?.outcome,
      retry: unmatched && event.status === "received",
    };
  });
}

async function applyRefundTransition(refund, state, providerRefundId, eventId, session) {
  if (refund.status === "processed" || refund.status === "failed") return;
  const payment = await Payment.findById(refund.paymentId).session(session);
  if (!payment) throw fail(404, "Payment not found for refund.");
  refund.providerRefundId = providerRefundId;
  if (state === "processed") {
    refund.status = "processed";
    refund.processedAt = new Date();
    payment.refundedAmountPaise += refund.amountPaise;
    payment.status = payment.refundedAmountPaise >= payment.capturedAmountPaise ? "refunded" : "partially_refunded";
  } else refund.status = "failed";
  payment.pendingRefundAmountPaise = Math.max(0, payment.pendingRefundAmountPaise - refund.amountPaise);
  await payment.save({ session });
  await refund.save({ session });
  const kind = state === "processed" ? "refund_processed" : "refund_failed";
  await createLedger({
    eventKey: `refund-${state}:${refund._id}`,
    kind,
    bookingId: refund.bookingId,
    paymentId: payment._id,
    refundId: refund._id,
    providerEventId: eventId,
    amountPaise: refund.amountPaise,
    recordedAt: new Date(),
    actorId: refund.requestedById,
  }, session);
  if (state === "processed") {
    const booking = await Booking.findById(refund.bookingId).session(session);
    if (booking) await enqueuePaymentNotification({
      booking,
      eventType: "refund_processed",
      amountPaise: refund.amountPaise,
      installment: "refund",
      eventId: `refund-success-${refund._id}`,
      session,
    });
  } else {
    const booking = await Booking.findById(refund.bookingId).session(session);
    if (booking) await enqueuePaymentNotification({
      booking,
      eventType: "refund_failed",
      amountPaise: refund.amountPaise,
      installment: "refund",
      eventId: `refund-failed-${refund._id}`,
      session,
    });
  }
}

export async function getVendorSettlement(actor) {
  if (actor.role !== "vendor") throw fail(403, "Only vendors may view vendor settlements.");
  const profile = await Vendor.findOne({ userId: actor._id }).select("_id");
  if (!profile) throw fail(404, "Vendor profile not found.");
  const payments = await Payment.find({ vendorId: profile._id });
  const totals = payments.reduce((total, payment) => {
    total.grossCapturedPaise += payment.capturedAmountPaise;
    total.platformCommissionPaise += payment.capturedAmountPaise
      ? Math.floor(payment.capturedAmountPaise * payment.commissionBps / 10000) : 0;
    total.refundedPaise += payment.refundedAmountPaise;
    return total;
  }, { grossCapturedPaise: 0, platformCommissionPaise: 0, refundedPaise: 0 });
  return {
    currency: "INR",
    status: "held",
    payoutsEnabled: false,
    totals: {
      ...totals,
      vendorPayablePaise: Math.max(0,
        totals.grossCapturedPaise - totals.platformCommissionPaise - totals.refundedPaise),
    },
  };
}

export async function getAdminFinancialReport() {
  const [paymentTotals, paymentRows, refundTotals, refunds, exceptionCount, exceptions, transactions, transactionRows] = await Promise.all([
    Payment.aggregate([
      { $lookup: {
        from: Refund.collection.name,
        localField: "_id",
        foreignField: "paymentId",
        as: "refundRows",
      } },
      { $addFields: {
        processedRefundPaise: { $sum: { $map: {
          input: { $filter: { input: "$refundRows", as: "refund", cond: { $eq: ["$$refund.status", "processed"] } } },
          as: "refund",
          in: "$$refund.amountPaise",
        } } },
      } },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        successfulPayments: { $sum: { $cond: [{ $in: ["$status", ["captured", "partially_refunded", "refunded"]] }, 1, 0] } },
        failedPayments: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        pendingPayments: { $sum: { $cond: [{ $in: ["$status", ["creating", "created", "authorized", "reconciliation_required"]] }, 1, 0] } },
        grossCapturedPaise: { $sum: "$capturedAmountPaise" },
        processedRefundPaise: { $sum: "$processedRefundPaise" },
        platformRevenuePaise: { $sum: {
          $subtract: [
            { $floor: { $divide: [{ $multiply: ["$capturedAmountPaise", "$commissionBps"] }, 10000] } },
            { $floor: { $divide: [{ $multiply: ["$processedRefundPaise", "$commissionBps"] }, 10000] } },
          ],
        } },
      } },
    ]),
    Payment.find().select("bookingId installment status amountPaise capturedAmountPaise refundedAmountPaise updatedAt").sort({ updatedAt: -1 }).limit(100).lean(),
    Refund.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 }, amountPaise: { $sum: "$amountPaise" } } },
    ]),
    Refund.find().select("paymentId bookingId amountPaise status reason createdAt processedAt").sort({ createdAt: -1 }).limit(100).lean(),
    PaymentReconciliationException.countDocuments({ status: "open" }),
    PaymentReconciliationException.find({ status: "open" }).select("reason status createdAt bookingId paymentId").sort({ createdAt: -1 }).limit(50).lean(),
    FinancialTransaction.aggregate([
      { $group: { _id: "$kind", count: { $sum: 1 }, amountPaise: { $sum: "$amountPaise" } } },
    ]),
    FinancialTransaction.find().select("kind bookingId paymentId refundId amountPaise currency recordedAt actorId note")
      .sort({ recordedAt: -1 }).limit(100).lean(),
  ]);
  const ledger = Object.fromEntries(transactions.map(row => [row._id, {
    count: row.count,
    amountPaise: row.amountPaise,
  }]));
  const totals = paymentTotals[0] || {
    count: 0, successfulPayments: 0, failedPayments: 0, pendingPayments: 0,
    grossCapturedPaise: 0, processedRefundPaise: 0, platformRevenuePaise: 0,
  };
  const refundCount = refundTotals.reduce((count, row) => count + row.count, 0);
  const processedRefundCount = refundTotals.find(row => row._id === "processed")?.count || 0;
  const refundedPaise = totals.processedRefundPaise;
  return {
    currency: "INR",
    counts: {
      successfulPayments: totals.successfulPayments,
      failedPayments: totals.failedPayments,
      pendingPayments: totals.pendingPayments,
      refunds: refundCount,
      processedRefunds: processedRefundCount,
      openReconciliationExceptions: exceptionCount,
    },
    totals: {
      grossCapturedPaise: totals.grossCapturedPaise,
      refundedPaise,
      platformRevenuePaise: totals.platformRevenuePaise,
      vendorPayablePaise: Math.max(0, totals.grossCapturedPaise - refundedPaise - totals.platformRevenuePaise),
    },
    ledger,
    reconciliationExceptions: exceptions.map(item => ({
      _id: String(item._id),
      reason: item.reason,
      status: item.status,
      createdAt: item.createdAt,
      bookingId: item.bookingId ? String(item.bookingId) : null,
      paymentId: item.paymentId ? String(item.paymentId) : null,
    })),
    payments: payments.map(payment => ({
      _id: String(payment._id),
      bookingId: String(payment.bookingId),
      installment: payment.installment,
      status: payment.status,
      amountPaise: payment.amountPaise,
      capturedAmountPaise: payment.capturedAmountPaise,
      refundedAmountPaise: payment.refundedAmountPaise,
      updatedAt: payment.updatedAt,
    })),
    refunds: refunds.map(refund => ({
      _id: String(refund._id),
      paymentId: String(refund.paymentId),
      bookingId: String(refund.bookingId),
      amountPaise: refund.amountPaise,
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt,
      processedAt: refund.processedAt,
    })),
    transactions: transactionRows.map(transaction => ({
      _id: String(transaction._id),
      kind: transaction.kind,
      bookingId: String(transaction.bookingId),
      paymentId: transaction.paymentId ? String(transaction.paymentId) : null,
      refundId: transaction.refundId ? String(transaction.refundId) : null,
      amountPaise: transaction.amountPaise,
      currency: transaction.currency,
      recordedAt: transaction.recordedAt,
      note: transaction.note,
    })),
  };
}

export async function resolveReconciliationException(exceptionId, actor, body) {
  if (actor.role !== "admin") throw fail(403, "Only administrators may resolve reconciliation exceptions.");
  const note = typeof body?.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 500) : "";
  if (!note || Object.keys(body || {}).some(field => field !== "resolutionNote"))
    throw fail(400, "Provide a resolution note.");
  const updated = await PaymentReconciliationException.findOneAndUpdate({
    _id: exceptionId,
    status: "open",
  }, {
    $set: { status: "resolved", resolutionNote: note, resolvedById: actor._id, resolvedAt: new Date() },
  }, { new: true, runValidators: true });
  if (!updated) throw fail(404, "Open reconciliation exception not found.");
  return {
    _id: String(updated._id),
    reason: updated.reason,
    status: updated.status,
    resolutionNote: updated.resolutionNote,
    resolvedAt: updated.resolvedAt,
  };
}
