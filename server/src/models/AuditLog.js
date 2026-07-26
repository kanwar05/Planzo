import mongoose from "mongoose";

export const AUDIT_ACTIONS = [
  "vendor_approved",
  "vendor_rejected",
  "booking_edited",
  "review_deleted",
  "user_suspended",
  "user_unsuspended",
  "role_changed",
  "login",
];

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetType: { type: String, required: true, index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    targetLabel: { type: String, trim: true, default: "" },
    ip: { type: String, required: true, default: "Unknown" },
    browser: { type: String, required: true, default: "Unknown browser" },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false },
);

auditLogSchema.index({ createdAt: -1, action: 1 });
auditLogSchema.index({ targetLabel: "text", reason: "text" });

export default mongoose.model("AuditLog", auditLogSchema);
