import { createHash } from "node:crypto";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import {
  createAdminRefund,
  createPaymentOrder,
  getAdminFinancialReport,
  getCustomerPaymentHistory,
  getVendorSettlement,
  processPaymentWebhookEvent,
  resolveReconciliationException,
  verifyCheckoutPayment,
} from "../services/paymentDomainService.js";
import { createBookingInvoicePdf, createPaymentReceiptPdf } from "../services/paymentDocumentService.js";
import {
  getRazorpayProvider,
  razorpayConfiguration,
  verifyWebhookSignature,
} from "../services/razorpayProvider.js";

const objectBody = (body, allowed) => body && typeof body === "object" && !Array.isArray(body) &&
  Object.keys(body).every(key => allowed.includes(key));

export const createOrder = asyncHandler(async (req, res) => {
  if (!objectBody(req.body, ["installment"]))
    throw new ApiError(400, "Provide the supported installment field only.");
  const result = await createPaymentOrder(
    req.params.bookingId, req.user, req.body.installment, req.get("Idempotency-Key"),
  );
  res.status(result.replayed ? 200 : 201).set("Cache-Control", "no-store").json({
    success: true,
    payment: result.payment,
    checkout: { keyId: result.keyId, orderId: result.payment.providerOrderId, currency: "INR" },
  });
});

export const verifyCheckout = asyncHandler(async (req, res) => {
  if (!objectBody(req.body, ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"]))
    throw new ApiError(400, "Provide the supported Razorpay callback fields only.");
  const result = await verifyCheckoutPayment(req.user, {
    orderId: req.body.razorpay_order_id,
    paymentId: req.body.razorpay_payment_id,
    signature: req.body.razorpay_signature,
  });
  res.set("Cache-Control", "no-store").json({
    success: true,
    confirmed: result.confirmed,
    message: result.confirmed
      ? "Payment confirmation received from Razorpay."
      : "Payment details were verified. Final confirmation is pending from Razorpay.",
    payment: result.payment,
  });
});

export const getBookingPayments = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store").json({
    success: true,
    ...await getCustomerPaymentHistory(req.params.bookingId, req.user),
  });
});

export const getVendorSettlements = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store").json({
    success: true,
    settlement: await getVendorSettlement(req.user),
  });
});

export const getFinancialReport = asyncHandler(async (_req, res) => {
  res.set("Cache-Control", "no-store").json({
    success: true,
    report: await getAdminFinancialReport(),
  });
});

export const createRefund = asyncHandler(async (req, res) => {
  const result = await createAdminRefund(
    req.params.paymentId, req.user, req.body, req.get("Idempotency-Key"),
  );
  res.status(result.replayed ? 200 : 201).set("Cache-Control", "no-store").json({
    success: true,
    refund: result.refund,
  });
});

export const resolveException = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store").json({
    success: true,
    exception: await resolveReconciliationException(req.params.exceptionId, req.user, req.body),
  });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const pdf = await createBookingInvoicePdf(req.params.bookingId, req.user);
  res.set({
    "Cache-Control": "no-store",
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="planzo-invoice-${req.params.bookingId}.pdf"`,
  }).send(pdf);
});

export const getReceipt = asyncHandler(async (req, res) => {
  const pdf = await createPaymentReceiptPdf(req.params.paymentId, req.user);
  res.set({
    "Cache-Control": "no-store",
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="planzo-receipt-${req.params.paymentId}.pdf"`,
  }).send(pdf);
});

export const razorpayWebhook = asyncHandler(async (req, res) => {
  const config = razorpayConfiguration();
  if (!config) throw new ApiError(503, "Online payment webhooks are not configured.");
  if (!Buffer.isBuffer(req.body))
    throw new ApiError(400, "Webhook body must be received as raw bytes.");
  const signature = req.get("X-Razorpay-Signature");
  if (!verifyWebhookSignature(req.body, signature, config.webhookSecret))
    throw new ApiError(400, "Webhook signature verification failed.");
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    throw new ApiError(400, "Webhook body contains invalid JSON.");
  }
  if (!event || typeof event.event !== "string" || event.event.length > 80)
    throw new ApiError(400, "Webhook event is invalid.");
  const digest = createHash("sha256").update(req.body).digest("hex");
  const suppliedId = req.get("X-Razorpay-Event-Id");
  const eventId = typeof suppliedId === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(suppliedId)
    ? suppliedId
    : digest;
  const entity = event.payload?.payment?.entity ||
    event.payload?.refund?.entity ||
    event.payload?.order?.entity;
  const providerPayments = event.event === "order.paid" && entity?.id
    ? await getRazorpayProvider().fetchOrderPayments(entity.id)
    : [];
  const result = await processPaymentWebhookEvent({
    eventId,
    eventType: event.event,
    payloadHash: digest,
    entity,
    providerPayments,
  });
  if (result.retry) return res.status(503).json({
    success: false,
    message: "Webhook event is awaiting payment reconciliation. Retry delivery.",
  });
  res.status(result.status === "unmatched" ? 202 : 200).json({
    success: true,
    received: true,
    duplicate: result.duplicate,
  });
});
