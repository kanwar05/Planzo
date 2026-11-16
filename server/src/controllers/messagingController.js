import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import * as messaging from "../services/messagingService.js";

export const getConversation = asyncHandler(async (req, res) => res.json({ success: true, ...await messaging.getConversation(req.params.bookingId, req.user) }));
export const createConversation = asyncHandler(async (req, res) => {
  if (req.body && (typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length))
    throw new ApiError(400, "Conversation participants come from the booking; no body fields are accepted.");
  const result = await messaging.createConversation(req.params.bookingId, req.user);
  res.status(result.created ? 201 : 200).json({ success: true, ...result });
});
export const getMessages = asyncHandler(async (req, res) => res.json({ success: true, ...await messaging.getMessages(req.params.bookingId, req.user, req.query) }));
export const sendMessage = asyncHandler(async (req, res) => {
  const result = await messaging.sendMessage(req.params.bookingId, req.user, req.body);
  res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
});
export const markRead = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== "throughSequence"))
    throw new ApiError(400, "Provide throughSequence only.");
  res.json({ success: true, ...await messaging.markConversationRead(req.params.bookingId, req.user, req.body.throughSequence) });
});
export const getUnreadCounts = asyncHandler(async (req, res) => res.json({ success: true, ...await messaging.getUnreadCounts(req.user, req.query) }));
