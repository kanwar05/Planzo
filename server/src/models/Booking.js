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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

bookingSchema.index({ vendorId: 1, createdAt: -1 });
bookingSchema.index({ customerId: 1, createdAt: -1 });

export default mongoose.model("Booking", bookingSchema);
