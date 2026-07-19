import mongoose from "mongoose";

export const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "completed",
  "cancelled",
];

const bookingSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: [true, "Event type is required."],
      trim: true,
      maxlength: [100, "Event type cannot exceed 100 characters."],
    },
    eventDate: {
      type: Date,
      required: [true, "Event date is required."],
    },
    eventDateOnly: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Event date must use YYYY-MM-DD format."],
      index: true,
    },
    eventStartTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must use HH:mm format."],
    },
    eventEndTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "End time must use HH:mm format."],
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
    eventLocation: {
      type: String,
      required: [true, "Event location is required."],
      trim: true,
      maxlength: [200, "Event location cannot exceed 200 characters."],
    },
    budget: {
      type: Number,
      required: [true, "Budget is required."],
      min: [0, "Budget cannot be negative."],
    },
    paymentStatus: { type: String, enum: ["pending", "deposit_paid", "partially_paid", "paid", "refunded", "partially_refunded", "failed"], default: "pending", index: true },
    paymentMethod: String,
    totalAmount: { type: Number, min: 0 }, totalPaidAmount: { type: Number, default: 0, min: 0 },
    depositPercentage: { type: Number, default: 25 }, eventDayPercentage: { type: Number, default: 40 }, finalPercentage: { type: Number, default: 35 },
    depositAmount: { type: Number, min: 0 }, eventDayAmount: { type: Number, min: 0 }, finalPaymentAmount: { type: Number, min: 0 }, remainingAmount: { type: Number, min: 0 },
    refundAmount: { type: Number, default: 0, min: 0 },
    refundPercentage: { type: Number, default: 0, min: 0, max: 100 },
    refundStatus: { type: String, enum: ["not_applicable", "pending_review", "approved", "processing", "partially_refunded", "refunded", "rejected", "failed", "disputed"], default: "not_applicable", index: true },
    refundReason: String,
    cancellationReason: { type: String, trim: true, default: "" },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    cancelledByRole: { type: String, enum: ["customer", "vendor", "admin"], default: null },
    cancelledAt: { type: Date, default: null },
    cancellationRequest: { type: mongoose.Schema.Types.ObjectId, ref: "CancellationRequest", default: null },
    cancellationTimeline: [{ action: String, status: String, note: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now }, _id: false }],
    latestTransactionId: String,
    paymentHistory: [{ paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" }, transactionId: String, provider: String, installmentType: String, amount: Number, currency: String, status: String, paymentMethod: String, razorpayOrderId: String, razorpayPaymentId: String, failureCode: String, failureReason: String, paidAt: Date, refundedAmount: { type: Number, default: 0 }, refundedAt: Date, createdAt: { type: Date, default: Date.now }, _id: false }],
    payoutStatus: { type: String, enum: ["not_eligible", "pending", "processing", "completed", "failed", "on_hold", "reversed"], default: "not_eligible", index: true },
    payoutOnHold: { type: Boolean, default: false }, vendorPayoutAmount: { type: Number, default: 0 }, platformFeeAmount: { type: Number, default: 0 }, cancellationFeeAmount: { type: Number, default: 0 }, payoutReference: String, payoutCompletedAt: Date,
    specialRequirements: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        2000,
        "Special requirements cannot exceed 2000 characters.",
      ],
    },
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending",
      index: true,
    },
    bookingReminderDueAt: {
      type: Date,
      default: null,
      index: true,
    },
    bookingReminderSentAt: {
      type: Date,
      default: null,
      index: true,
    },
    reviewReminderDueAt: {
      type: Date,
      default: null,
      index: true,
    },
    reviewReminderSentAt: {
      type: Date,
      default: null,
      index: true,
    },
    googleCalendarEventId: { type: String, default: null, index: true },
    googleCalendarSyncedAt: { type: Date, default: null },
    googleCalendarSyncError: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bookingSchema.index({ vendorId: 1, createdAt: -1 });
bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ vendorId: 1, eventDateOnly: 1, status: 1 });
bookingSchema.index({ bookingReminderDueAt: 1, bookingReminderSentAt: 1 });
bookingSchema.index({ reviewReminderDueAt: 1, reviewReminderSentAt: 1 });

export default mongoose.model("Booking", bookingSchema);
