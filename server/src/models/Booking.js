import mongoose from "mongoose";

export const BOOKING_STATUSES = ["pending", "accepted", "rejected", "cancelled", "completed"];
const bookingSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  eventType: { type: String, required: true, trim: true, maxlength: 120 },
  eventDate: { type: Date, required: true },
  eventDateOnly: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  eventLocation: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  notes: { type: String, trim: true, maxlength: 1000, default: "" },
  status: { type: String, enum: BOOKING_STATUSES, default: "pending", required: true },
  rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
  cancellationReason: { type: String, trim: true, maxlength: 1000, default: "" },
}, { timestamps: true, versionKey: false });

bookingSchema.pre("init", function normalizeLegacy(data) {
  if (!data.eventDateOnly && data.eventDate) data.eventDateOnly = new Date(data.eventDate).toISOString().slice(0, 10);
  if (!data.description) data.description = data.specialRequirements || "";
});
bookingSchema.pre("validate", function normalizeEventDay(next) {
  if (this.eventDate && !Number.isNaN(this.eventDate.getTime())) {
    this.eventDateOnly = this.eventDate.toISOString().slice(0, 10);
    this.eventDate = new Date(`${this.eventDateOnly}T00:00:00.000Z`);
  }
  next();
});
// The database, rather than an earlier availability read, arbitrates simultaneous accepts.
// Build this index before serving traffic. Audit legacy collisions/date keys before rollout.
bookingSchema.index({ vendorId: 1, eventDateOnly: 1 }, {
  name: "one_confirmed_booking_per_vendor_date", unique: true,
  partialFilterExpression: { status: { $in: ["accepted", "completed"] } },
});
bookingSchema.index({ customerId: 1, createdAt: -1 });
export default mongoose.model("Booking", bookingSchema);
