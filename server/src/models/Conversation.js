import mongoose from "mongoose";

const counter = () => ({ type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger });
const conversationSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  vendorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, immutable: true },
  lastSequence: counter(),
  customerReadSequence: counter(), vendorReadSequence: counter(),
  customerUnreadCount: counter(), vendorUnreadCount: counter(),
  customerReadAt: { type: Date, default: null }, vendorReadAt: { type: Date, default: null },
  customerAlertAfter: { type: Date, default: null }, vendorAlertAfter: { type: Date, default: null },
  lastMessageAt: { type: Date, default: null },
  // A guard also makes a read-marker update contend with a simultaneous send.
  guardRevision: { ...counter(), select: false },
}, { collection: "bookingconversations", timestamps: true, versionKey: false });

conversationSchema.index({ bookingId: 1 }, { unique: true, name: "one_conversation_per_booking" });
conversationSchema.index({ customerId: 1, lastMessageAt: -1 });
conversationSchema.index({ vendorUserId: 1, lastMessageAt: -1 });

export default mongoose.model("Conversation", conversationSchema);
