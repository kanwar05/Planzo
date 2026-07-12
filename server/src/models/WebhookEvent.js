import mongoose from "mongoose";
const schema = new mongoose.Schema({ provider: { type: String, required: true }, eventId: { type: String, required: true }, eventType: String, status: { type: String, enum: ["processing", "processed", "failed"], default: "processing" }, error: String, processedAt: Date }, { timestamps: true, versionKey: false });
schema.index({ provider: 1, eventId: 1 }, { unique: true });
export default mongoose.model("WebhookEvent", schema);
