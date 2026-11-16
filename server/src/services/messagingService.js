import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import ApiError from "../utils/ApiError.js";
import { isActiveAccount } from "../utils/accountEligibility.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { lockAccountForBooking, lockVendorForBooking, withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { consumeMessagingRate } from "../utils/messagingRateLimit.js";
import { bookingView, populateBooking } from "./bookingViewService.js";
import { conversationView, messageView } from "./messagingViewService.js";
import { publishMessagingEvent } from "./messagingEvents.js";
import { enqueueMessageAlert } from "./messageNotificationService.js";

const id = value => String(value?._id || value || "");
const invalid = message => new ApiError(400, message);
const conversationMismatch = () => new ApiError(409, "Conversation participants need operator review.");
export function validateMessagingId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) throw invalid("Invalid booking id.");
}
function isId(value) { return /^[a-f0-9]{24}$/i.test(id(value)); }
async function currentActor(actor, session = null) {
  if (!actor || !["customer", "vendor"].includes(actor.role) || !isId(actor._id))
    throw new ApiError(403, "Only booking customers and vendors may use messaging.");
  const current = await User.findById(actor._id).session(session);
  if (!isActiveAccount(current)) throw new ApiError(403, "This account is unavailable.");
  if (current.role !== actor.role || (current.authVersion || 0) !== (actor.authVersion || 0))
    throw new ApiError(401, "Your account changed. Please log in again.");
  return current;
}
function assertWritable(access) {
  assertVerifiedEmail(access.selfRole === "customer" ? access.customer : access.vendorOwner);
  if (!isActiveAccount(access.peer)) throw new ApiError(409, "The other participant is unavailable for messaging.");
  if (!["pending", "accepted"].includes(access.booking.status))
    throw new ApiError(409, "This booking's conversation is read-only.");
}

export async function authorizeConversationAccess(bookingId, actor, { write = false, session = null } = {}) {
  validateMessagingId(bookingId);
  const current = await currentActor(actor, session);
  const booking = await Booking.findById(bookingId).session(session).lean();
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (!isId(booking.vendorId) || !isId(booking.customerId)) throw new ApiError(404, "Booking participants are unavailable.");
  const vendor = await Vendor.findById(booking.vendorId).session(session).lean();
  if (!vendor || !isId(vendor.userId)) throw new ApiError(404, "Booking participants are unavailable.");
  const selfRole = current.role === "customer" && id(current) === id(booking.customerId) ? "customer"
    : current.role === "vendor" && id(current) === id(vendor.userId) ? "vendor" : null;
  if (!selfRole) throw new ApiError(403, "You cannot access this booking's conversation.");
  const customer = selfRole === "customer" ? current : await User.findById(booking.customerId).session(session);
  const vendorOwner = selfRole === "vendor" ? current : await User.findById(vendor.userId).session(session);
  const peer = selfRole === "customer" ? vendorOwner : customer;
  const access = { booking, vendor, customer, vendorOwner, selfRole, peer };
  if (write) assertWritable(access);
  return access;
}

function assertParticipants(conversation, access) {
  if (conversation && (id(conversation.customerId) !== id(access.booking.customerId) ||
      id(conversation.vendorUserId) !== id(access.vendor.userId) || id(conversation.vendorId) !== id(access.vendor._id)))
    throw conversationMismatch();
  return conversation;
}
async function existingConversation(access, session = null) {
  return assertParticipants(await Conversation.findOne({ bookingId: access.booking._id }).session(session), access);
}
async function ensureConversation(access, session) {
  const existing = await existingConversation(access, session);
  if (existing) return { conversation: existing, created: false };
  const [conversation] = await Conversation.create([{
    bookingId: access.booking._id, customerId: access.booking.customerId,
    vendorId: access.vendor._id, vendorUserId: access.vendor.userId,
  }], { session });
  return { conversation, created: true };
}

// All messaging writes acquire accounts in stable ID order, then the existing
// vendor guard, booking write fence, then the conversation. Status transitions
// all write the booking itself, including transitions without a vendor guard.
async function lockedAccess(bookingId, actor, session, { both = true, verified = true } = {}) {
  const initial = await authorizeConversationAccess(bookingId, actor, { session });
  const accounts = both ? [id(initial.booking.customerId), id(initial.vendor.userId)].sort() : [id(actor)];
  for (const accountId of [...new Set(accounts)]) {
    const account = await lockAccountForBooking(accountId, session);
    if (accountId === id(actor)) {
      if ((account.authVersion || 0) !== (actor.authVersion || 0)) throw new ApiError(401, "Your account changed. Please log in again.");
      if (verified) assertVerifiedEmail(account);
    }
  }
  await lockVendorForBooking(initial.vendor._id, session);
  return authorizeConversationAccess(bookingId, actor, { session });
}
async function bookingForView(bookingId, actor) {
  return bookingView(await populateBooking(Booking.findById(bookingId)).lean(), actor);
}
async function guardSendableBooking(access, session) {
  const current = await Booking.findOneAndUpdate({ _id: access.booking._id, status: { $in: ["pending", "accepted"] } },
    { $inc: { messagingGuardRevision: 1 } }, { session, timestamps: false, new: true }).lean();
  if (!current) throw new ApiError(409, "This booking's conversation is read-only.");
  access.booking = current;
}

export async function getConversation(bookingId, actor) {
  const access = await authorizeConversationAccess(bookingId, actor);
  consumeMessagingRate(id(actor), "read");
  const conversation = await existingConversation(access);
  return { conversation: conversationView(conversation, access), booking: await bookingForView(bookingId, actor) };
}
export async function createConversation(bookingId, actor) {
  await authorizeConversationAccess(bookingId, actor, { write: true });
  consumeMessagingRate(id(actor), "subscribe");
  const result = await withBookingTransaction(async session => {
    const access = await lockedAccess(bookingId, actor, session);
    assertWritable(access);
    const existing = await existingConversation(access, session);
    if (!existing) await guardSendableBooking(access, session);
    const ensured = existing ? { conversation: existing, created: false } : await ensureConversation(access, session);
    return { conversation: conversationView(ensured.conversation, access), created: ensured.created };
  });
  return { ...result, booking: await bookingForView(bookingId, actor) };
}

function sequenceInput(value, name, minimum = 0) {
  const parsed = typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed >= Number.MAX_SAFE_INTEGER)
    throw invalid(`${name} must be a bounded whole number.`);
  return parsed;
}
function historyQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query) || Object.keys(query).some(key => !["before", "after", "limit"].includes(key)))
    throw invalid("Unsupported history query.");
  if (query.before !== undefined && query.after !== undefined) throw invalid("Use either before or after, not both.");
  const limit = query.limit === undefined ? 30 : sequenceInput(query.limit, "Limit", 1);
  if (limit > 50) throw invalid("History pages contain at most 50 messages.");
  return { limit, before: query.before === undefined ? null : sequenceInput(query.before, "Before cursor", 1),
    after: query.after === undefined ? null : sequenceInput(query.after, "After cursor") };
}
export async function getMessages(bookingId, actor, query = {}) {
  const page = historyQuery(query);
  const access = await authorizeConversationAccess(bookingId, actor);
  consumeMessagingRate(id(actor), "read");
  const conversation = await existingConversation(access);
  const view = conversationView(conversation, access);
  if (!conversation) return { messages: [], conversation: view, pagination: { hasMore: false, nextBefore: null, nextAfter: 0 } };
  const sequence = { $lte: conversation.lastSequence };
  if (page.before !== null) sequence.$lt = page.before;
  if (page.after !== null) sequence.$gt = page.after;
  const rows = await Message.find({ conversationId: conversation._id, sequence })
    .sort({ sequence: page.after === null ? -1 : 1 }).limit(page.limit + 1);
  const hasMore = rows.length > page.limit;
  const messages = rows.slice(0, page.limit);
  if (page.after === null) messages.reverse();
  return { messages: messages.map(messageView), conversation: view, pagination: {
    hasMore, nextBefore: messages[0]?.sequence ?? null,
    nextAfter: messages.at(-1)?.sequence ?? page.after ?? 0,
  } };
}

export function normalizeMessageInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["body", "clientMessageId"].includes(key)))
    throw invalid("Provide message text and a clientMessageId only.");
  if (typeof body.clientMessageId !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(body.clientMessageId))
    throw invalid("Provide a stable clientMessageId of 16 to 128 safe ASCII characters.");
  if (typeof body.body !== "string" || body.body.length > 4000 || Buffer.byteLength(body.body, "utf8") > 16000)
    throw invalid("Message text must contain at most 4000 characters and 16000 UTF-8 bytes.");
  const text = body.body.replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!text) throw invalid("Message text is required.");
  return { clientMessageId: body.clientMessageId, body: text };
}
async function replayMessage(conversation, actor, content, session = null) {
  if (!conversation) return null;
  const previous = await Message.findOne({ conversationId: conversation._id, senderId: actor._id, clientMessageId: content.clientMessageId }).session(session);
  if (previous && previous.body !== content.body) throw new ApiError(409, "This clientMessageId was already used for different message text.");
  return previous;
}
export async function sendMessage(bookingId, actor, body) {
  const content = normalizeMessageInput(body);
  await authorizeConversationAccess(bookingId, actor);
  consumeMessagingRate(id(actor), "send");
  const messageId = new mongoose.Types.ObjectId();
  let result;
  try {
    result = await withBookingTransaction(async session => {
      const access = await lockedAccess(bookingId, actor, session);
      let conversation = await existingConversation(access, session);
      const previous = await replayMessage(conversation, actor, content, session);
      if (previous) return { message: messageView(previous), conversation: conversationView(conversation, access), replayed: true };
      assertWritable(access);
      await guardSendableBooking(access, session);
      conversation ||= (await ensureConversation(access, session)).conversation;
      if (conversation.lastSequence >= Number.MAX_SAFE_INTEGER - 1) throw new ApiError(409, "This conversation has reached its message limit.");
      const recipientRole = access.selfRole === "customer" ? "vendor" : "customer";
      conversation = await Conversation.findOneAndUpdate({ _id: conversation._id, lastSequence: conversation.lastSequence }, {
        $inc: { lastSequence: 1, [`${recipientRole}UnreadCount`]: 1, guardRevision: 1 }, $set: { lastMessageAt: new Date() },
      }, { new: true, session, runValidators: true });
      if (!conversation) throw new ApiError(409, "The conversation changed. Retry this same message.");
      const [message] = await Message.create([{
        _id: messageId, conversationId: conversation._id, bookingId: access.booking._id,
        senderId: actor._id, senderRole: access.selfRole, sequence: conversation.lastSequence, ...content,
      }], { session });
      await enqueueMessageAlert({ conversation, booking: access.booking,
        recipientUserId: recipientRole === "customer" ? access.booking.customerId : access.vendor.userId, recipientRole, session });
      return { message: messageView(message), conversation: conversationView(conversation, access), replayed: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const access = await authorizeConversationAccess(bookingId, actor);
    const conversation = await existingConversation(access);
    const previous = await replayMessage(conversation, actor, content);
    if (!previous) throw new ApiError(409, "The conversation changed. Retry this same message.");
    result = { message: messageView(previous), conversation: conversationView(conversation, access), replayed: true };
  }
  if (!result.replayed) publishMessagingEvent({ type: "message:new", bookingId: id(bookingId), message: result.message });
  return result;
}

export async function markConversationRead(bookingId, actor, throughSequence) {
  const through = sequenceInput(throughSequence, "Read sequence");
  await authorizeConversationAccess(bookingId, actor);
  consumeMessagingRate(id(actor), "read");
  const result = await withBookingTransaction(async session => {
    const access = await lockedAccess(bookingId, actor, session, { both: false, verified: false });
    let conversation = await existingConversation(access, session);
    if (through > (conversation?.lastSequence || 0)) throw invalid("Cannot mark unseen future messages as read.");
    const field = `${access.selfRole}ReadSequence`;
    if (!conversation || through <= conversation[field]) return { conversation: conversationView(conversation, access), changed: false };
    conversation = await Conversation.findOneAndUpdate({ _id: conversation._id }, { $inc: { guardRevision: 1 } }, { new: true, session, timestamps: false });
    const unread = await Message.countDocuments({ conversationId: conversation._id,
      senderRole: access.selfRole === "customer" ? "vendor" : "customer", sequence: { $gt: through } }).session(session);
    const readAt = new Date();
    conversation = await Conversation.findOneAndUpdate({ _id: conversation._id }, { $set: {
      [field]: through, [`${access.selfRole}ReadAt`]: readAt, [`${access.selfRole}UnreadCount`]: unread,
    } }, { new: true, session, runValidators: true });
    return { conversation: conversationView(conversation, access), changed: true, readerRole: access.selfRole, readAt };
  });
  if (result.changed) publishMessagingEvent({ type: "conversation:read", bookingId: id(bookingId),
    readerRole: result.readerRole, readThroughSequence: through, readAt: result.readAt });
  return { conversation: result.conversation };
}

export async function getUnreadCounts(actor, query = {}) {
  const current = await currentActor(actor);
  consumeMessagingRate(id(actor), "read");
  if (!query || typeof query !== "object" || Array.isArray(query) || Object.keys(query).some(key => key !== "bookingIds"))
    throw invalid("Unsupported unread-count query.");
  let bookingIds;
  if (query.bookingIds !== undefined) {
    if (typeof query.bookingIds !== "string") throw invalid("bookingIds must be a comma-separated list.");
    bookingIds = [...new Set(query.bookingIds.split(",").map(value => value.toLowerCase()))];
    if (!bookingIds.length || bookingIds.length > 100) throw invalid("Request between 1 and 100 booking IDs.");
    bookingIds.forEach(validateMessagingId);
    const scope = current.role === "customer" ? { customerId: current._id } : {
      vendorId: (await Vendor.findOne({ userId: current._id }).select("_id").lean())?._id || null,
    };
    const count = await Booking.countDocuments({ _id: { $in: bookingIds }, ...scope });
    if (count !== bookingIds.length) throw new ApiError(403, "One or more bookings are not accessible.");
  }
  const filter = { [current.role === "customer" ? "customerId" : "vendorUserId"]: current._id,
    ...(bookingIds ? { bookingId: { $in: bookingIds.map(value => new mongoose.Types.ObjectId(value)) } } : {}) };
  const rows = await Conversation.find(filter).sort({ lastMessageAt: -1, _id: -1 }).limit(100).lean();
  const unreadCounts = Object.fromEntries((bookingIds || []).map(value => [value, 0]));
  for (const row of rows) unreadCounts[id(row.bookingId)] = row[`${current.role}UnreadCount`] || 0;
  const [sum] = await Conversation.aggregate([{ $match: filter }, { $group: { _id: null, count: { $sum: `$${current.role}UnreadCount` } } }]);
  return { unreadCounts, totalUnread: sum?.count || 0 };
}
