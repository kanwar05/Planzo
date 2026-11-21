import mongoose from "mongoose";
import { agreementSchema } from "./quotationSchemas.js";

export const SUPPORT_CASE_CATEGORIES = [
  "vendor_unresponsive", "cancellation_disagreement", "vendor_no_show",
  "service_not_delivered", "service_quality", "payment_refund_question",
];
export const SUPPORT_CASE_STATUSES = ["open", "investigating", "resolved", "closed"];
export const ACTIVE_SUPPORT_CASE_STATUSES = ["open", "investigating", "resolved"];
export const MAX_SUPPORT_EVIDENCE = 20;

const evidenceSchema = new mongoose.Schema({
  evidenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  publicId: { type: String, required: true, maxlength: 300, select: false },
  sha256: { type: String, match: /^[a-f0-9]{64}$/, default: undefined, select: false },
  format: { type: String, required: true, enum: ["jpg", "png", "webp"] },
  bytes: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024, validate: Number.isSafeInteger },
  uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, select: false },
  uploaderRole: { type: String, enum: ["customer", "vendor", "admin"], required: true },
  createdAt: { type: Date, required: true },
}, { _id: false });

const supportCaseSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, immutable: true },
  // Missing legacy profiles must not prevent the customer from requesting help.
  vendorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  openedById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  openedByRole: { type: String, enum: ["customer", "vendor"], required: true, immutable: true },
  category: { type: String, enum: SUPPORT_CASE_CATEGORIES, required: true, immutable: true },
  subject: { type: String, required: true, maxlength: 160, immutable: true },
  description: { type: String, required: true, maxlength: 4000, immutable: true },
  bookingStatusAtOpen: { type: String, enum: ["pending", "accepted", "rejected", "cancelled", "completed"], required: true, immutable: true },
  agreementSnapshot: { type: agreementSchema, default: undefined, immutable: true },
  status: { type: String, enum: SUPPORT_CASE_STATUSES, default: "open", required: true },
  assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revision: { type: Number, default: 1, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  resolution: { type: String, maxlength: 4000, default: "" },
  resolvedAt: { type: Date, default: null }, closedAt: { type: Date, default: null },
  evidence: { type: [evidenceSchema], default: [], validate: value => value.length <= MAX_SUPPORT_EVIDENCE },
  creationKeyHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, select: false, immutable: true },
  creationRequestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/, select: false, immutable: true },
}, { collection: "bookingsupportcases", timestamps: true, versionKey: false });

supportCaseSchema.index({ bookingId: 1, category: 1 }, {
  unique: true, name: "one_active_support_category_per_booking",
  partialFilterExpression: { status: { $in: ACTIVE_SUPPORT_CASE_STATUSES } },
});
supportCaseSchema.index({ openedById: 1, creationKeyHash: 1 }, { unique: true, name: "one_support_case_per_opener_retry_key" });
supportCaseSchema.index({ bookingId: 1, createdAt: -1 });
supportCaseSchema.index({ status: 1, createdAt: -1 });
supportCaseSchema.index({ assignedAdminId: 1, status: 1, createdAt: -1 });

export default mongoose.model("SupportCase", supportCaseSchema);
