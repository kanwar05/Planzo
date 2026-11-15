import mongoose from "mongoose";
import { quotationContentDefinition } from "./quotationSchemas.js";

const quotationSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, select: false },
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  requestKeyHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  requestHash: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
  ...quotationContentDefinition,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

quotationSchema.index({ bookingId: 1, revision: 1 }, { unique: true, name: "one_quotation_revision_per_booking" });
quotationSchema.index({ bookingId: 1, requestKeyHash: 1 }, { unique: true, name: "one_quotation_per_booking_request_key" });
quotationSchema.pre("save", function preventSavedRevisionChanges(next) {
  if (!this.isNew) return next(new Error("Quotation revisions are append-only."));
  return next();
});
for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"])
  quotationSchema.pre(method, function preventRevisionMutation(next) {
    next(new Error("Quotation revisions are append-only."));
  });
quotationSchema.pre("deleteOne", { document: true, query: false }, function preventDocumentRemoval(next) {
  next(new Error("Quotation revisions are append-only."));
});

export default mongoose.model("Quotation", quotationSchema);
