import mongoose from "mongoose";

const schema = new mongoose.Schema({
  fingerprint: { type: String, required: true, immutable: true, maxlength: 180 },
  reason: { type: String, enum: ["unmatched_provider_event", "amount_mismatch", "currency_mismatch", "duplicate_capture", "booking_state_changed_after_order", "provider_timeout", "provider_rejection", "refund_mismatch"], required: true, immutable: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: undefined, immutable: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: undefined, immutable: true },
  providerEventId: { type: String, maxlength: 100, default: undefined, immutable: true },
  status: { type: String, enum: ["open", "resolved"], default: "open", required: true },
  resolutionNote: { type: String, maxlength: 500, default: "" },
  resolvedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

schema.index({ fingerprint: 1 }, { unique: true, name: "one_reconciliation_exception_per_fingerprint" });
schema.index({ status: 1, createdAt: -1 });
export default mongoose.model("PaymentReconciliationException", schema);
