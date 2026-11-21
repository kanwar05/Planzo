import mongoose from "mongoose";

const cutoff = () => ({ type: Number, default: null, min: 0, max: 8760,
  validate: value => value === null || Number.isSafeInteger(value) });
export const cancellationPolicyDefinition = {
  key: { type: String, enum: ["standard", "legacy"], required: true },
  version: { type: Number, min: 0, max: 100, required: true, validate: Number.isSafeInteger },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 2000 },
  // No default on hydration: missing historical zones must remain grandfathered
  // as UTC instead of being silently reinterpreted as today's IST policy.
  timeZone: { type: String, enum: ["UTC", "Asia/Kolkata"], default: undefined },
  customerPendingCutoffHours: cutoff(),
  customerAcceptedCutoffHours: cutoff(),
  vendorCutoffHours: cutoff(),
  consequences: { type: String, required: true, maxlength: 2000 },
};
export const cancellationPolicySnapshotSchema = new mongoose.Schema(cancellationPolicyDefinition, { _id: false });
export const cancellationRecordSchema = new mongoose.Schema({
  cancellationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  cancelledById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  cancelledByRole: { type: String, enum: ["customer", "vendor", "admin"], required: true },
  cancelledAt: { type: Date, required: true },
  previousStatus: { type: String, enum: ["pending", "accepted"], required: true },
  reason: { type: String, maxlength: 1000, default: "" },
  policySnapshot: { type: cancellationPolicySnapshotSchema, required: true },
  policySource: { type: String, enum: ["accepted", "legacy", "pending"], required: true },
  overridePolicy: { type: Boolean, default: false },
}, { _id: false });
