import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";
import { assertConversationMember, createMessage, getOrCreateConversation, markConversationRead } from "../services/chatService.js";

const attachmentFrom = (file) => ({
  url: file.path, publicId: file.filename, originalName: file.originalname,
  mimeType: file.mimetype, size: file.size,
  kind: file.mimetype.startsWith("image/") ? "image" : "file",
});

export const createConversation = asyncHandler(async (req, res) => {
  const conversation = await getOrCreateConversation({ user: req.user, participantId: req.body.participantId, bookingId: req.body.bookingId });
  await conversation.populate("participants", "name role lastSeenAt");
  res.status(200).json({ success: true, conversation });
});

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({
    participants: req.user._id,
    participantStates: { $elemMatch: { user: req.user._id, deletedAt: null } },
  })
    .populate("participants", "name role lastSeenAt")
    .populate("booking", "eventType eventDate status")
    .populate({ path: "lastMessage", select: "text attachments sender seenBy deliveredTo deletedAt createdAt" })
    .sort({ lastMessageAt: -1 })
    .lean();
  const unreadCount = conversations.reduce((sum, item) => sum + (item.participantStates.find((state) => String(state.user) === String(req.user._id))?.unreadCount || 0), 0);
  res.json({ success: true, conversations, unreadCount });
});

export const getMessages = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "conversation id");
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw new ApiError(404, "Conversation not found.");
  assertConversationMember(conversation, req.user._id);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
  const filter = { conversation: conversation._id, deletedFor: { $ne: req.user._id } };
  if (req.query.search) filter.$text = { $search: String(req.query.search).slice(0, 100) };
  const [messages, total] = await Promise.all([
    Message.find(filter).populate("sender", "name role lastSeenAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Message.countDocuments(filter),
  ]);
  res.json({ success: true, messages: messages.reverse(), pagination: { page, limit, total, hasMore: page * limit < total } });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const message = await createMessage({ conversationId: req.params.id, user: req.user, text: req.body.text, attachments: (req.files || []).map(attachmentFrom) });
  req.app.get("chatGateway")?.broadcastMessage(message);
  res.status(201).json({ success: true, message });
});

export const readConversation = asyncHandler(async (req, res) => {
  const result = await markConversationRead({ conversationId: req.params.id, userId: req.user._id });
  req.app.get("chatGateway")?.broadcastSeen(req.params.id, req.user._id, result.seenAt);
  res.json({ success: true, seenAt: result.seenAt });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  validateObjectId(req.params.messageId, "message id");
  const message = await Message.findById(req.params.messageId);
  if (!message) throw new ApiError(404, "Message not found.");
  if (String(message.sender) !== String(req.user._id)) throw new ApiError(403, "Only the sender can delete this message.");
  message.text = ""; message.attachments = []; message.deletedAt = new Date(); await message.save();
  req.app.get("chatGateway")?.broadcastDeleted(message);
  res.json({ success: true, message });
});

export const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw new ApiError(404, "Conversation not found.");
  assertConversationMember(conversation, req.user._id);
  const state = conversation.participantStates.find((item) => String(item.user) === String(req.user._id));
  state.deletedAt = new Date(); state.unreadCount = 0; await conversation.save();
  res.json({ success: true, message: "Conversation removed from your chat list." });
});
