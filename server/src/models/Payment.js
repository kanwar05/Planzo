import mongoose from "mongoose";

export const INSTALLMENT_TYPES = ["booking_deposit", "event_day_payment", "final_payment", "cancellation_fee", "refund"];
export const PAYMENT_STATUSES = ["created", "pending", "authorized", "captured", "failed", "partially_refunded", "refunded", "cancelled"];

const refundSchema = new mongoose.Schema({
  refundId: String, amount: { type: Number, min: 0 }, reason: String,
  status: { type: String, default: "pending" }, initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  providerRefundId: String, createdAt: { type: Date, default: Date.now }, completedAt: Date,
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  provider: { type: String, required: true, default: "razorpay" }, currency: { type: String, default: "INR" },
  installmentType: { type: String, enum: INSTALLMENT_TYPES, required: true }, installmentSequence: { type: Number, min: 0 },
  amount: { type: Number, required: true, min: 0 }, refundedAmount: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, required: true, min: 0 }, status: { type: String, enum: PAYMENT_STATUSES, default: "created", index: true },
  paymentMethod: String, providerOrderId: { type: String, sparse: true, index: true }, providerPaymentId: { type: String, sparse: true },
  providerSignature: { type: String, select: false }, transactionId: String,
  idempotencyKey: { type: String, required: true }, expiresAt: { type: Date, index: true },
  failureCode: String, failureReason: String, refunds: [refundSchema],
  webhookEvents: [{ eventId: String, eventType: String, processedAt: { type: Date, default: Date.now }, _id: false }],
  receiptEmailSentAt: Date, invoiceNumber: { type: String, sparse: true, unique: true }, invoiceUrl: String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, paidAt: Date, failedAt: Date, refundedAt: Date,
}, { timestamps: true, versionKey: false });

paymentSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } });
paymentSchema.index({ transactionId: 1 }, { unique: true, partialFilterExpression: { transactionId: { $type: "string" } } });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ booking: 1, installmentType: 1 }, { unique: true, partialFilterExpression: { status: "captured", installmentType: { $in: ["booking_deposit", "event_day_payment", "final_payment"] } } });

export default mongoose.model("Payment", paymentSchema);
