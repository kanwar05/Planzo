import mongoose from "mongoose";
import { MAX_COMMERCIAL_AMOUNT } from "./quotationSchemas.js";
import { cancellationPolicySnapshotSchema, cancellationRecordSchema } from "./cancellationPolicySchemas.js";

const refundSchema = new mongoose.Schema({
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", required: true, immutable: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  requestedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  amountPaise: { type: Number, min: 1, max: MAX_COMMERCIAL_AMOUNT, required: true, immutable: true, validate: Number.isSafeInteger },
  currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
  status: { type: String, enum: ["processing", "processed", "failed", "reconciliation_required"], default: "processing", required: true },
  providerRefundId: { type: String, maxlength: 80, default: undefined },
  reason: { type: String, required: true, maxlength: 500, immutable: true },
  cancellationPolicySnapshot: { type: cancellationPolicySnapshotSchema, default: undefined, immutable: true },
  cancellationRecordSnapshot: { type: cancellationRecordSchema, default: undefined, immutable: true },
  idempotencyKeyHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  requestHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  processedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

refundSchema.index({ paymentId: 1, idempotencyKeyHash: 1 }, { unique: true, name: "one_refund_per_payment_idempotency_key" });
refundSchema.index({ providerRefundId: 1 }, { unique: true, partialFilterExpression: { providerRefundId: { $type: "string" } }, name: "unique_razorpay_refund_id" });
refundSchema.index({ bookingId: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Refund", refundSchema);
