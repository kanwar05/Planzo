import mongoose from "mongoose";

export const BOOKING_EMAIL_EVENTS = [
  "booking_requested", "booking_accepted", "booking_rejected",
  "booking_cancelled", "booking_completed",
];

// Explicit snapshot fields prevent private account/booking data from slipping
// into templates. This collection is internal and has no API endpoint.
const payloadSchema = new mongoose.Schema({
  customerName: { type: String, default: "", maxlength: 80 },
  vendorName: { type: String, default: "", maxlength: 120 },
  service: { type: String, default: "", maxlength: 120 },
  eventType: { type: String, default: "", maxlength: 120 },
  eventDateOnly: { type: String, default: "", maxlength: 10 },
  eventLocation: { type: String, default: "", maxlength: 300 },
  recipientRole: { type: String, enum: ["customer", "vendor"], required: true },
}, { _id: false });

const outboxSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  eventId: { type: String, required: true, immutable: true, maxlength: 80 },
  eventType: { type: String, enum: BOOKING_EMAIL_EVENTS, required: true, immutable: true },
  // Null/empty snapshots only occur for orphaned legacy recipients; enqueue a
  // terminal failed record instead of changing an otherwise valid booking action.
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  recipientEmail: { type: String, default: "", maxlength: 254, immutable: true },
  payload: { type: payloadSchema, required: true, immutable: true },
  status: { type: String, enum: ["pending", "processing", "sent", "failed"], default: "pending", required: true },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  sentAt: { type: Date, default: null },
  lastError: { type: String, default: "", maxlength: 200 },
  leaseToken: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

outboxSchema.index({ eventId: 1, recipientUserId: 1 }, {
  unique: true, name: "one_booking_email_per_event_recipient",
});
outboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
outboxSchema.index({ status: 1, leaseExpiresAt: 1 });

export default mongoose.model("NotificationOutbox", outboxSchema);
