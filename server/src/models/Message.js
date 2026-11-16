import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, immutable: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, select: false },
  senderRole: { type: String, enum: ["customer", "vendor"], required: true, immutable: true },
  sequence: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger, immutable: true },
  clientMessageId: { type: String, required: true, match: /^[A-Za-z0-9._:-]{16,128}$/, immutable: true },
  body: { type: String, required: true, maxlength: 4000, immutable: true,
    validate: value => typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= 16000 },
}, { collection: "bookingmessages", timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

messageSchema.index({ conversationId: 1, sequence: 1 }, { unique: true, name: "one_message_per_conversation_sequence" });
messageSchema.index({ conversationId: 1, senderId: 1, clientMessageId: 1 }, {
  unique: true, name: "one_message_per_sender_retry_key",
});
messageSchema.pre("save", function preventMessageEdit(next) {
  return next(this.isNew ? undefined : new Error("Messages are append-only."));
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"])
  messageSchema.pre(operation, function preventMessageMutation(next) { next(new Error("Messages are append-only.")); });
messageSchema.pre("deleteOne", { document: true, query: false }, function preventMessageRemoval(next) { next(new Error("Messages are append-only.")); });

export default mongoose.model("Message", messageSchema);
