import mongoose from "mongoose";
import { MAX_COMMERCIAL_AMOUNT } from "./quotationSchemas.js";
import { cancellationPolicySnapshotSchema } from "./cancellationPolicySchemas.js";

const integer = (min, max) => ({
  type: Number,
  min,
  max,
  validate: Number.isSafeInteger,
});
const attemptSchema = new mongoose.Schema({
  providerPaymentId: { type: String, required: true, maxlength: 80 },
  status: { type: String, enum: ["authorized", "captured", "failed"], required: true },
  amountPaise: { ...integer(1, MAX_COMMERCIAL_AMOUNT), required: true },
  currency: { type: String, enum: ["INR"], required: true },
  failureCode: { type: String, maxlength: 80, default: "" },
  updatedAt: { type: Date, required: true },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, immutable: true },
  installment: { type: String, enum: ["deposit", "balance"], required: true, immutable: true },
  status: {
    type: String,
    enum: ["creating", "created", "authorized", "captured", "failed", "partially_refunded", "refunded", "reconciliation_required"],
    default: "creating",
    required: true,
  },
  amountPaise: { ...integer(1, MAX_COMMERCIAL_AMOUNT), required: true, immutable: true },
  capturedAmountPaise: { ...integer(0, MAX_COMMERCIAL_AMOUNT), default: 0 },
  refundedAmountPaise: { ...integer(0, MAX_COMMERCIAL_AMOUNT), default: 0 },
  pendingRefundAmountPaise: { ...integer(0, MAX_COMMERCIAL_AMOUNT), default: 0 },
  currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
  commissionBps: { ...integer(0, 10000), required: true, immutable: true },
  commissionAmountPaise: { ...integer(0, MAX_COMMERCIAL_AMOUNT), required: true, immutable: true },
  vendorPayablePaise: { ...integer(0, MAX_COMMERCIAL_AMOUNT), required: true, immutable: true },
  settlementStatus: { type: String, enum: ["unfunded", "held", "payable", "settled"], default: "unfunded", required: true },
  provider: { type: String, enum: ["razorpay"], default: "razorpay", required: true, immutable: true },
  providerOrderId: { type: String, maxlength: 80, default: undefined },
  attempts: { type: [attemptSchema], default: [] },
  idempotencyKeyHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  requestHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  cancellationPolicySnapshot: { type: cancellationPolicySnapshotSchema, default: undefined, immutable: true },
}, { timestamps: true, versionKey: false });

paymentSchema.index({ bookingId: 1, installment: 1 }, { unique: true, name: "one_payment_obligation_per_booking_installment" });
paymentSchema.index({ customerId: 1, idempotencyKeyHash: 1 }, { unique: true, name: "one_payment_per_customer_idempotency_key" });
paymentSchema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: "string" } }, name: "unique_razorpay_order_id" });
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
