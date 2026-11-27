import mongoose from "mongoose";

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, immutable: true, maxlength: 100 },
  eventType: { type: String, required: true, immutable: true, maxlength: 80 },
  payloadHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  status: { type: String, enum: ["received", "processed", "unmatched", "failed"], default: "received", required: true },
  failureCode: { type: String, maxlength: 80, default: "" },
  deliveryAttempts: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  receivedAt: { type: Date, required: true, immutable: true },
  processedAt: { type: Date, default: null },
}, { versionKey: false });

schema.index({ eventKey: 1 }, { unique: true, name: "one_record_per_razorpay_webhook_event" });
schema.index({ status: 1, receivedAt: -1 });
export default mongoose.model("PaymentWebhookEvent", schema);
