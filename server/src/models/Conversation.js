import mongoose from "mongoose";

const participantStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  unreadCount: { type: Number, default: 0, min: 0 },
  lastReadAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  participants: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    validate: { validator: (value) => value.length === 2 && String(value[0]) !== String(value[1]), message: "A conversation requires two different participants." },
    required: true,
  },
  participantKey: { type: String, required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null, index: true },
  participantStates: { type: [participantStateSchema], required: true },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  lastMessageAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true, versionKey: false });

conversationSchema.index(
  { participantKey: 1, booking: 1 },
  { unique: true, partialFilterExpression: { booking: { $type: "objectId" } } },
);
conversationSchema.index(
  { participantKey: 1 },
  { name: "direct_participant_unique", unique: true, partialFilterExpression: { booking: null } },
);
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const participantKeyFor = (participants) =>
  participants.map(String).sort().join(":");

export default mongoose.model("Conversation", conversationSchema);
