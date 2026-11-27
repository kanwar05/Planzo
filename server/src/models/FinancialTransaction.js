import mongoose from "mongoose";
import { MAX_COMMERCIAL_AMOUNT } from "./quotationSchemas.js";

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, immutable: true, maxlength: 180 },
  kind: { type: String, enum: ["order_created", "payment_authorized", "payment_captured", "payment_failed", "refund_requested", "refund_processed", "refund_failed", "reconciliation_exception"], required: true, immutable: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: undefined, immutable: true },
  refundId: { type: mongoose.Schema.Types.ObjectId, ref: "Refund", default: undefined, immutable: true },
  providerEventId: { type: String, maxlength: 100, default: undefined, immutable: true },
  amountPaise: { type: Number, min: 0, max: MAX_COMMERCIAL_AMOUNT, required: true, immutable: true, validate: Number.isSafeInteger },
  currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
  recordedAt: { type: Date, required: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined, immutable: true },
  note: { type: String, maxlength: 500, default: "", immutable: true },
}, { versionKey: false });

schema.index({ eventKey: 1 }, { unique: true, name: "one_financial_ledger_entry_per_event" });
schema.index({ bookingId: 1, recordedAt: -1 });
schema.index({ kind: 1, recordedAt: -1 });
schema.pre("save", function appendOnly(next) {
  next(this.isNew ? undefined : new Error("Financial transactions are append-only."));
});
for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"])
  schema.pre(method, function appendOnly(next) { next(new Error("Financial transactions are append-only.")); });
schema.pre("deleteOne", { document: true, query: false }, function appendOnly(next) {
  next(new Error("Financial transactions are append-only."));
});

export default mongoose.model("FinancialTransaction", schema);
