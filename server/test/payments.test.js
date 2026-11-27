import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import FinancialTransaction from "../src/models/FinancialTransaction.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import Payment from "../src/models/Payment.js";
import PaymentReconciliationException from "../src/models/PaymentReconciliationException.js";
import PaymentWebhookEvent from "../src/models/PaymentWebhookEvent.js";
import Refund from "../src/models/Refund.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { setRazorpayProviderForTests } from "../src/services/razorpayProvider.js";
import { defaultCancellationPolicy } from "../src/services/cancellationPolicyViewService.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

const originalEnv = Object.fromEntries([
  "JWT_SECRET", "RAZORPAY_MODE", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET", "PAYMENT_DEPOSIT_BPS", "PLATFORM_COMMISSION_BPS",
].map(key => [key, process.env[key]]));
let mongo;
let sequence = 0;
let provider;
const secret = "razorpay-test-key-secret";
const webhookSecret = "razorpay-test-webhook-secret";
const auth = actor => `Bearer ${generateAccessToken(actor._id, actor.authVersion || 0)}`;
const serviceDate = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const makeUser = role => {
  sequence += 1;
  return User.create({
    name: `Payment ${role} ${sequence}`,
    email: `payment-${sequence}@example.test`,
    phone: `987650${String(sequence).padStart(4, "0")}`,
    password: "PaymentTestSecure123!",
    role,
    emailVerifiedAt: new Date(),
  });
};

function fakeProvider() {
  let orderNumber = 0;
  let refundNumber = 0;
  const payments = new Map();
  const refunds = new Map();
  return {
    payments,
    refunds,
    orderCalls: 0,
    refundCalls: 0,
    async createOrder({ amountPaise }) {
      this.orderCalls += 1;
      const id = `order_${++orderNumber}`;
      return { id, amount: amountPaise, currency: "INR" };
    },
    async fetchPayment(id) {
      const payment = payments.get(id);
      if (!payment) throw new Error("Missing test payment.");
      return payment;
    },
    async fetchOrderPayments(orderId) {
      return [...payments.values()].filter(payment => payment.orderId === orderId);
    },
    async createRefund({ paymentId, amountPaise, refundId }) {
      this.refundCalls += 1;
      const value = { id: `rfnd_${++refundNumber}`, paymentId, amount: amountPaise, status: "created", refundId };
      refunds.set(value.id, value);
      return value;
    },
  };
}

async function fixture({ totalAmount = 10000, accepted = true } = {}) {
  const [customer, otherCustomer, owner, admin] = await Promise.all([
    makeUser("customer"), makeUser("customer"), makeUser("vendor"), makeUser("admin"),
  ]);
  const vendor = await Vendor.create({
    userId: owner._id,
    businessName: "Payment Test Studio",
    serviceCategory: "Decoration",
    description: "Test event services.",
    location: "Delhi",
    pricing: 100,
    verificationStatus: "approved",
  });
  const day = serviceDate();
  const booking = await Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Wedding",
    eventDate: new Date(`${day}T00:00:00.000Z`),
    eventLocation: "Delhi",
    status: accepted ? "accepted" : "pending",
    quotationRevision: accepted ? 1 : 0,
    quotationStatus: accepted ? "accepted" : "none",
    ...(accepted ? { acceptedAgreement: {
      quotationId: new mongoose.Types.ObjectId(),
      revision: 1,
      acceptedAt: new Date(),
      cancellationPolicyAcknowledgedAt: new Date(),
      serviceDescription: "Wedding setup",
      items: [{ description: "Event services", quantity: 1, unitPriceAmount: totalAmount }],
      additionalCharges: [],
      discountAmount: 0,
      subtotalAmount: totalAmount,
      totalAmount,
      currency: "INR",
      serviceDate: day,
      deliverables: [],
      exclusions: [],
      terms: "Accepted test terms.",
      expiresAt: new Date(Date.now() + 86400000),
      cancellationPolicy: defaultCancellationPolicy(),
    } } : {}),
  });
  return { customer, otherCustomer, owner, admin, vendor, booking };
}

async function createOrder(actor, bookingId, installment = "deposit", key = randomUUID()) {
  return request(app).post(`/api/payments/bookings/${bookingId}/orders`)
    .set("Authorization", auth(actor))
    .set("Idempotency-Key", key)
    .send({ installment });
}

function signature(value, key) {
  return createHmac("sha256", key).update(value).digest("hex");
}

async function capturedOrder(fixtureValue) {
  const response = await createOrder(fixtureValue.customer, fixtureValue.booking._id);
  assert.equal(response.status, 201, response.body.message);
  const payment = response.body.payment;
  const providerPayment = {
    id: "pay_captured_123",
    orderId: payment.providerOrderId,
    amountPaise: payment.amountPaise,
    currency: "INR",
    status: "captured",
    errorCode: "",
  };
  provider.payments.set(providerPayment.id, providerPayment);
  return { response, payment, providerPayment };
}

async function sendWebhook(eventId, event, entity) {
  const body = JSON.stringify({ event, payload: { [event.startsWith("refund.") ? "refund" : "payment"]: { entity } } });
  return request(app).post("/api/payments/webhook")
    .set("Content-Type", "application/json")
    .set("X-Razorpay-Signature", signature(body, webhookSecret))
    .set("X-Razorpay-Event-Id", eventId)
    .send(body);
}

before(async () => {
  process.env.JWT_SECRET = "payment-tests-secret-with-at-least-32-characters";
  process.env.RAZORPAY_MODE = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
  process.env.RAZORPAY_KEY_SECRET = secret;
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  process.env.PAYMENT_DEPOSIT_BPS = "3000";
  process.env.PLATFORM_COMMISSION_BPS = "0";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(), Vendor.init(), Booking.init(), Payment.init(), Refund.init(),
    FinancialTransaction.init(), PaymentWebhookEvent.init(),
    PaymentReconciliationException.init(), NotificationOutbox.init(),
  ]);
});

beforeEach(async () => {
  provider = fakeProvider();
  setRazorpayProviderForTests(provider);
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});

after(async () => {
  setRazorpayProviderForTests(undefined);
  await mongoose.disconnect();
  await mongo?.stop();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("order creation is customer-authorized, server-priced, idempotent and limited to accepted agreements", async () => {
  const { customer, otherCustomer, booking } = await fixture();
  const initial = await createOrder(customer, booking._id, "deposit", "payment-key-000001");
  assert.equal(initial.status, 201, initial.body.message);
  assert.equal(initial.body.payment.amountPaise, 3000);
  assert.equal(initial.body.payment.currency, "INR");
  assert.equal(initial.body.checkout.keyId, "rzp_test_fixture");
  assert.equal(initial.body.checkout.orderId, initial.body.payment.providerOrderId);
  assert.equal(provider.orderCalls, 1);
  const replay = await createOrder(customer, booking._id, "deposit", "payment-key-000001");
  assert.equal(replay.status, 200);
  assert.equal(replay.body.payment._id, initial.body.payment._id);
  assert.equal(provider.orderCalls, 1);
  assert.equal(await Payment.countDocuments({ bookingId: booking._id }), 1);
  assert.equal((await createOrder(otherCustomer, booking._id)).status, 403);
  assert.equal((await request(app).post(`/api/payments/bookings/${booking._id}/orders`)
    .set("Authorization", auth(customer)).set("Idempotency-Key", randomUUID())
    .send({ installment: "deposit", amountPaise: 1 })).status, 400);
  const pending = await fixture({ accepted: false });
  assert.equal((await createOrder(pending.customer, pending.booking._id)).status, 409);
});

test("concurrent payment attempts create at most one obligation and one Razorpay order", async () => {
  const { customer, booking } = await fixture();
  const responses = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    createOrder(customer, booking._id, "deposit", `concurrent-payment-${index}`)));
  assert.equal(provider.orderCalls, 1);
  assert.equal(await Payment.countDocuments({ bookingId: booking._id, installment: "deposit" }), 1);
  assert.ok(responses.every(response => [200, 201, 409].includes(response.status)),
    responses.map(response => response.body.message).join("; "));
});

test("checkout callback is signature-checked and independently confirmed with Razorpay", async () => {
  const { customer, booking } = await fixture();
  const { payment } = await capturedOrder({ customer, booking });
  const responseBody = {
    razorpay_order_id: payment.providerOrderId,
    razorpay_payment_id: "pay_captured_123",
  };
  const callback = {
    ...responseBody,
    razorpay_signature: signature(`${responseBody.razorpay_order_id}|${responseBody.razorpay_payment_id}`, secret),
  };
  const verified = await request(app).post("/api/payments/verify")
    .set("Authorization", auth(customer)).send(callback);
  assert.equal(verified.status, 200, verified.body.message);
  assert.equal(verified.body.confirmed, true);
  assert.equal((await Payment.findById(payment._id)).status, "captured");
  assert.equal((await FinancialTransaction.countDocuments({ kind: "payment_captured" })), 1);
  assert.equal((await request(app).post("/api/payments/verify").set("Authorization", auth(customer))
    .send({ ...callback, razorpay_signature: "0".repeat(64) })).status, 400);
});

test("authorized and failed payments remain retryable without creating duplicate orders", async () => {
  const { customer, booking } = await fixture();
  const order = await createOrder(customer, booking._id);
  const providerPayment = {
    id: "pay_retry_123",
    orderId: order.body.payment.providerOrderId,
    amountPaise: order.body.payment.amountPaise,
    currency: "INR",
    status: "authorized",
    errorCode: "",
  };
  provider.payments.set(providerPayment.id, providerPayment);
  const callback = {
    razorpay_order_id: providerPayment.orderId,
    razorpay_payment_id: providerPayment.id,
    razorpay_signature: signature(`${providerPayment.orderId}|${providerPayment.id}`, secret),
  };
  const authorized = await request(app).post("/api/payments/verify")
    .set("Authorization", auth(customer)).send(callback);
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.confirmed, false);
  assert.equal(authorized.body.payment.status, "authorized");

  providerPayment.status = "failed";
  const failed = await sendWebhook("evt-payment-failed", "payment.failed", {
    id: providerPayment.id,
    order_id: providerPayment.orderId,
    amount: providerPayment.amountPaise,
    currency: "INR",
    status: "failed",
    error_code: "PAYMENT_DECLINED",
  });
  assert.equal(failed.status, 200);
  assert.equal((await Payment.findById(order.body.payment._id)).status, "failed");
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "payment_failed" }), 1);

  const retry = await createOrder(customer, booking._id, "deposit", "payment-retry-order-0001");
  assert.equal(retry.status, 200);
  assert.equal(retry.body.checkout.orderId, providerPayment.orderId);
  assert.equal(provider.orderCalls, 1);
});

test("webhook requires the raw-body signature, deduplicates events and records one capture", async () => {
  const { customer, booking } = await fixture();
  const { payment, providerPayment } = await capturedOrder({ customer, booking });
  const entity = {
    id: providerPayment.id,
    order_id: providerPayment.orderId,
    amount: providerPayment.amountPaise,
    currency: "INR",
    status: "captured",
  };
  const invalid = await request(app).post("/api/payments/webhook")
    .set("Content-Type", "application/json")
    .set("X-Razorpay-Signature", "0".repeat(64))
    .send(JSON.stringify({ event: "payment.captured", payload: { payment: { entity } } }));
  assert.equal(invalid.status, 400);
  assert.equal(await PaymentWebhookEvent.countDocuments(), 0);
  const first = await sendWebhook("evt-capture-1", "payment.captured", entity);
  const replay = await sendWebhook("evt-capture-1", "payment.captured", entity);
  assert.equal(first.status, 200, first.body.message);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);
  assert.equal((await Payment.findById(payment._id)).capturedAmountPaise, payment.amountPaise);
  assert.equal(await FinancialTransaction.countDocuments({ kind: "payment_captured" }), 1);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "payment_succeeded" }), 1);
});

test("refund controls are admin-only, reserve refundable value, and support partial then full refunds", async () => {
  const { customer, otherCustomer, admin, booking } = await fixture();
  const { payment, providerPayment } = await capturedOrder({ customer, booking });
  await sendWebhook("evt-capture-refund", "payment.captured", {
    id: providerPayment.id, order_id: providerPayment.orderId,
    amount: providerPayment.amountPaise, currency: "INR", status: "captured",
  });
  const path = `/api/admin/payments/${payment._id}/refunds`;
  const denied = await request(app).post(path).set("Authorization", auth(customer))
    .set("Idempotency-Key", "refund-auth-key-0001").send({ amountPaise: 1000, reason: "Approved review" });
  assert.equal(denied.status, 403);

  const first = await request(app).post(path).set("Authorization", auth(admin))
    .set("Idempotency-Key", "refund-admin-key-00001")
    .send({ amountPaise: 1200, reason: "Approved after manual review" });
  assert.equal(first.status, 201, first.body.message);
  assert.equal(first.body.refund.status, "processing");
  const refundRecord = await Refund.findById(first.body.refund._id);
  assert.ok(refundRecord.cancellationPolicySnapshot);
  assert.equal(refundRecord.cancellationRecordSnapshot, undefined);
  const replay = await request(app).post(path).set("Authorization", auth(admin))
    .set("Idempotency-Key", "refund-admin-key-00001")
    .send({ amountPaise: 1200, reason: "Approved after manual review" });
  assert.equal(replay.status, 200);
  assert.equal(provider.refundCalls, 1);
  const overLimit = await request(app).post(path).set("Authorization", auth(admin))
    .set("Idempotency-Key", "refund-admin-key-00002")
    .send({ amountPaise: 1801, reason: "Exceeds remaining balance" });
  assert.equal(overLimit.status, 409);

  const refundEntity = {
    id: provider.refunds.keys().next().value,
    payment_id: providerPayment.id,
    amount: 1200,
    status: "processed",
    notes: { planzo_refund_id: first.body.refund._id },
  };
  const processed = await sendWebhook("evt-refund-partial", "refund.processed", refundEntity);
  assert.equal(processed.status, 200, processed.body.message);
  let paymentDoc = await Payment.findById(payment._id);
  assert.equal(paymentDoc.status, "partially_refunded");
  assert.equal(paymentDoc.refundedAmountPaise, 1200);
  assert.equal(paymentDoc.pendingRefundAmountPaise, 0);

  const second = await request(app).post(path).set("Authorization", auth(admin))
    .set("Idempotency-Key", "refund-admin-key-00003")
    .send({ amountPaise: 1800, reason: "Approved final refund" });
  assert.equal(second.status, 201, second.body.message);
  const refundId = [...provider.refunds.keys()].at(-1);
  const full = await sendWebhook("evt-refund-full", "refund.processed", {
    id: refundId,
    payment_id: providerPayment.id,
    amount: 1800,
    status: "processed",
    notes: { planzo_refund_id: second.body.refund._id },
  });
  assert.equal(full.status, 200, full.body.message);
  paymentDoc = await Payment.findById(payment._id);
  assert.equal(paymentDoc.status, "refunded");
  assert.equal(paymentDoc.refundedAmountPaise, paymentDoc.capturedAmountPaise);
  assert.equal(await FinancialTransaction.countDocuments({ kind: "refund_processed" }), 2);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "refund_processed" }), 2);
  assert.equal(await PaymentReconciliationException.countDocuments({ status: "open" }), 0);
});

test("captured amount mismatches are preserved for reconciliation, not reported as successful", async () => {
  const { customer, booking } = await fixture();
  const { payment } = await capturedOrder({ customer, booking });
  const mismatch = await sendWebhook("evt-capture-mismatch", "payment.captured", {
    id: "pay_mismatched_amount",
    order_id: payment.providerOrderId,
    amount: payment.amountPaise - 1,
    currency: "INR",
    status: "captured",
  });
  assert.equal(mismatch.status, 200);
  const updated = await Payment.findById(payment._id);
  assert.equal(updated.status, "reconciliation_required");
  assert.equal(updated.capturedAmountPaise, payment.amountPaise - 1);
  assert.equal(await PaymentReconciliationException.countDocuments({
    paymentId: payment._id, reason: "amount_mismatch", status: "open",
  }), 1);
});

test("failed refund events release reserved value and notify the customer", async () => {
  const { customer, admin, booking } = await fixture();
  const { payment, providerPayment } = await capturedOrder({ customer, booking });
  await sendWebhook("evt-capture-refund-failure", "payment.captured", {
    id: providerPayment.id,
    order_id: providerPayment.orderId,
    amount: providerPayment.amountPaise,
    currency: "INR",
    status: "captured",
  });
  const created = await request(app).post(`/api/admin/payments/${payment._id}/refunds`)
    .set("Authorization", auth(admin))
    .set("Idempotency-Key", "refund-failure-test-key-001")
    .send({ amountPaise: 500, reason: "Test provider rejection" });
  assert.equal(created.status, 201, created.body.message);
  const refundId = [...provider.refunds.keys()].at(-1);
  const failed = await sendWebhook("evt-refund-failed", "refund.failed", {
    id: refundId,
    payment_id: providerPayment.id,
    amount: 500,
    status: "failed",
    notes: { planzo_refund_id: created.body.refund._id },
  });
  assert.equal(failed.status, 200);
  assert.equal((await Refund.findById(created.body.refund._id)).status, "failed");
  assert.equal((await Payment.findById(payment._id)).pendingRefundAmountPaise, 0);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "refund_failed" }), 1);
});

test("remaining balance is available only after the deposit is confirmed", async () => {
  const { customer, booking } = await fixture({ totalAmount: 10001 });
  const order = await createOrder(customer, booking._id, "balance");
  assert.equal(order.status, 409);
  const deposit = await createOrder(customer, booking._id);
  assert.equal(deposit.status, 201);
  const pay = {
    id: "pay_deposit_123",
    orderId: deposit.body.payment.providerOrderId,
    amountPaise: deposit.body.payment.amountPaise,
    currency: "INR",
    status: "captured",
    errorCode: "",
  };
  provider.payments.set(pay.id, pay);
  await sendWebhook("evt-deposit-balance", "payment.captured", {
    id: pay.id, order_id: pay.orderId, amount: pay.amountPaise, currency: "INR", status: "captured",
  });
  const balance = await createOrder(customer, booking._id, "balance", "payment-balance-key-01");
  assert.equal(balance.status, 201, balance.body.message);
  assert.equal(balance.body.payment.amountPaise, 7001);
});
