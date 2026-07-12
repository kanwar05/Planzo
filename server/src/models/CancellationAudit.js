import mongoose from "mongoose";
const schema = new mongoose.Schema({ booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true }, requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, paidAmount: Number, refundableAmount: Number, cancellationFeeAmount: Number, vendorCompensation: Number, platformFeeAdjustment: Number, requiresAdminReview: Boolean, policySnapshot: mongoose.Schema.Types.Mixed }, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
export default mongoose.model("CancellationAudit", schema);
