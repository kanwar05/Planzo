import mongoose from "mongoose";

// Append-only moderation facts. No account contacts or full profile snapshots.
const auditSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, immutable: true },
  action: { type: String, enum: ["approve", "reject", "suspend", "restore"], required: true, immutable: true },
  fromState: { type: String, required: true, maxlength: 40, immutable: true },
  toState: { type: String, required: true, maxlength: 40, immutable: true },
  reason: { type: String, default: "", trim: true, maxlength: 1000, immutable: true },
  profileRevision: { type: Number, min: 0, default: null, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

auditSchema.index({ vendorId: 1, createdAt: -1, _id: -1 });
export default mongoose.model("VendorModerationAudit", auditSchema);
