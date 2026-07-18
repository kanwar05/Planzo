import Booking from "../models/Booking.js";
import Conversation, { participantKeyFor } from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import { safeCreateNotification } from "../controllers/notificationController.js";

export const assertConversationMember = (conversation, userId) => {
  if (!conversation?.participants.some((id) => String(id?._id || id) === String(userId))) {
    throw new ApiError(403, "You are not a participant in this conversation.");
  }
};

const bookingParticipants = async (bookingId, user) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const vendor = await Vendor.findById(booking.vendorId);
  const participants = [booking.customerId, vendor?.userId].filter(Boolean);
  if (!participants.some((id) => String(id) === String(user._id)) && user.role !== "admin") {
    throw new ApiError(403, "You cannot access this booking chat.");
  }
  return { booking, participants };
};

export const getOrCreateConversation = async ({ user, participantId, bookingId }) => {
  let participants;
  let booking = null;
  if (bookingId) {
    const result = await bookingParticipants(bookingId, user);
    participants = result.participants; booking = result.booking;
  } else {
    if (!participantId || String(participantId) === String(user._id)) throw new ApiError(400, "Choose another user to start a chat.");
    if (!await User.exists({ _id: participantId })) throw new ApiError(404, "Chat participant not found.");
    participants = [user._id, participantId];
  }
  const key = participantKeyFor(participants);
  const selector = { participantKey: key, booking: booking?._id || null };
  let conversation = await Conversation.findOne(selector);
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        ...selector,
        participants,
        participantStates: participants.map((id) => ({ user: id })),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      conversation = await Conversation.findOne(selector);
    }
  }
  const ownState = conversation.participantStates.find((state) => String(state.user) === String(user._id));
  if (ownState?.deletedAt) { ownState.deletedAt = null; await conversation.save(); }
  return conversation;
};

export const createMessage = async ({ conversationId, user, text = "", attachments = [] }) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found.");
  assertConversationMember(conversation, user._id);
  const normalizedText = typeof text === "string" ? text.trim() : "";
  if (!normalizedText && !attachments.length) throw new ApiError(400, "Message text or an attachment is required.");
  const message = await Message.create({
    conversation: conversation._id,
    sender: user._id,
    text: normalizedText,
    attachments,
    deliveredTo: [user._id],
    seenBy: [user._id],
  });
  const recipient = conversation.participants.find((id) => String(id) !== String(user._id));
  const recipientUser = await User.findById(recipient).select("role");
  conversation.lastMessage = message._id;
  conversation.lastMessageAt = message.createdAt;
  for (const state of conversation.participantStates) {
    if (String(state.user) === String(recipient)) {
      state.unreadCount += 1;
      state.deletedAt = null;
    }
  }
  await conversation.save();
  await safeCreateNotification(
    recipient,
    "chat_message",
    `New message from ${user.name}`,
    normalizedText ? normalizedText.slice(0, 180) : "Sent an attachment",
    { actionUrl: recipientUser?.role === "vendor" ? `/vendor/messages/${conversation._id}` : `/messages/${conversation._id}` },
  );
  return message.populate("sender", "name role lastSeenAt");
};

export const markConversationRead = async ({ conversationId, userId }) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, "Conversation not found.");
  assertConversationMember(conversation, userId);
  const now = new Date();
  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: userId }, seenBy: { $ne: userId } },
    { $addToSet: { seenBy: userId, deliveredTo: userId }, $set: { seenAt: now, deliveredAt: now } },
  );
  const state = conversation.participantStates.find((item) => String(item.user) === String(userId));
  if (state) { state.unreadCount = 0; state.lastReadAt = now; }
  await conversation.save();
  return { conversation, seenAt: now };
};

export const markDelivered = async ({ conversationId, userId }) => {
  const now = new Date();
  await Message.updateMany(
    { conversation: conversationId, sender: { $ne: userId }, deliveredTo: { $ne: userId } },
    { $addToSet: { deliveredTo: userId }, $set: { deliveredAt: now } },
  );
  return now;
};
