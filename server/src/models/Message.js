import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  kind: { type: String, enum: ["image", "file"], required: true },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  text: { type: String, trim: true, maxlength: 4000, default: "" },
  attachments: { type: [attachmentSchema], default: [], validate: { validator: (value) => value.length <= 5, message: "A message can have at most 5 attachments." } },
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deliveredAt: { type: Date, default: null },
  seenAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true, versionKey: false });

messageSchema.pre("validate", function validateContent(next) {
  if (this.deletedAt) return next();
  if (!this.text && !this.attachments.length) return next(new Error("Message text or an attachment is required."));
  return next();
});
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, text: "text" });

export default mongoose.model("Message", messageSchema);
