import mongoose from "mongoose";

export const VERIFICATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_resubmission",
];

export const DOCUMENT_TYPES = [
  "governmentId",
  "businessLicense",
  "gstCertificate",
  "panCard",
  "profilePhoto",
];

const documentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 1 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: VERIFICATION_STATUSES, required: true },
    reason: { type: String, trim: true, default: "" },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const vendorVerificationSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, unique: true, index: true },
    documents: {
      governmentId: { type: documentSchema, default: null },
      businessLicense: { type: documentSchema, default: null },
      gstCertificate: { type: documentSchema, default: null },
      panCard: { type: documentSchema, default: null },
      profilePhoto: { type: documentSchema, default: null },
    },
    status: { type: String, enum: VERIFICATION_STATUSES, default: "pending", index: true },
    reason: { type: String, trim: true, default: "" },
    verificationHistory: { type: [historySchema], default: [] },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("VendorVerification", vendorVerificationSchema);
