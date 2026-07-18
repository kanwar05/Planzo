import mongoose from "mongoose";

export const REFUND_STATUSES = ["not_applicable", "pending_review", "approved", "processing", "partially_refunded", "refunded", "rejected", "failed", "disputed"];

const timelineSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },
  status: { type: String, required: true, trim: true },
  note: { type: String, default: "", trim: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const cancellationRequestSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  cancelledByRole: { type: String, enum: ["customer", "vendor", "admin"], required: true },
  cancelledAt: { type: Date, default: Date.now, index: true },
  cancellationReason: { type: String, required: true, trim: true, maxlength: 1000 },
  paidAmount: { type: Number, default: 0, min: 0 },
  refundPercentage: { type: Number, default: 0, min: 0, max: 100 },
  refundAmount: { type: Number, default: 0, min: 0 },
  lateCancellationFee: { type: Number, default: 0, min: 0 },
  refundStatus: { type: String, enum: REFUND_STATUSES, required: true, index: true },
  refundReason: { type: String, default: "", trim: true },
  policyOutcome: { type: String, enum: ["no_refund", "partial_refund", "full_refund"], required: true },
  policySnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  disputeReason: { type: String, default: "", trim: true, maxlength: 1000 },
  disputedAt: { type: Date, default: null },
  timeline: { type: [timelineSchema], default: [] },
}, { timestamps: true, versionKey: false });

export default mongoose.model("CancellationRequest", cancellationRequestSchema);
