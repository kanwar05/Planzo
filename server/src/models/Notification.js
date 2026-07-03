import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "booking_created",
  "booking_accepted",
  "booking_rejected",
  "booking_completed",
  "review_created",
  "vendor_replied",
  "booking_update",
  "review_reminder",
  "vendor_reply",
  "profile_completion_nudge",
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: [true, "Notification type is required."],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Notification title is required."],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters."],
    },
    message: {
      type: String,
      required: [true, "Notification message is required."],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters."],
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Related entity IDs for different notification types
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      default: null,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
    // Additional metadata
    actionUrl: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Index for efficient queries
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
