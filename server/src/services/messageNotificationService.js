import Conversation from "../models/Conversation.js";
import NotificationOutbox from "../models/NotificationOutbox.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import { isActiveAccount } from "../utils/accountEligibility.js";
import { hasVerifiedEmail } from "../utils/emailVerification.js";
import { validateEmail } from "../utils/validation.js";

export const MESSAGE_EMAIL_POLICY = Object.freeze({ delayMs: 90_000, cooldownMs: 15 * 60_000 });
const same = (left, right) => String(left || "") === String(right || "");
const emailAllowed = user => isActiveAccount(user) && hasVerifiedEmail(user) &&
  user.notificationPreferences?.bookingUpdates !== false;

// Notification preferences were retired from the UI. Honour a persisted legacy
// bookingUpdates opt-out without recreating a preference-management feature.
export async function enqueueMessageAlert({ conversation, booking, recipientUserId, recipientRole, session, now = new Date() }) {
  if (!session?.inTransaction()) throw new Error("Message alerts must share the message transaction.");
  if (!["customer", "vendor"].includes(recipientRole)) throw new Error("Invalid message recipient role.");
  const recipient = await User.findById(recipientUserId)
    .select("email role accountStatus suspendedAt emailVerifiedAt notificationPreferences").session(session).lean();
  if (!recipient || recipient.role !== recipientRole || !emailAllowed(recipient)) return null;
  try { validateEmail(recipient.email); } catch { return null; }
  const clock = new Date(now);
  if (!Number.isFinite(clock.getTime())) throw new Error("Invalid message alert clock.");
  const field = `${recipientRole}AlertAfter`;
  const target = recipientRole === "customer" ? "customerId" : "vendorUserId";
  const claimed = await Conversation.findOneAndUpdate({
    _id: conversation._id, [target]: recipientUserId, [`${recipientRole}UnreadCount`]: { $gt: 0 },
    $or: [{ [field]: null }, { [field]: { $lte: clock } }],
  }, { $set: { [field]: new Date(clock.getTime() + MESSAGE_EMAIL_POLICY.cooldownMs) } }, { new: true, session });
  if (!claimed) return null;
  const [job] = await NotificationOutbox.create([{
    bookingId: booking._id, eventId: `message:${conversation._id}:${recipientRole}:${clock.getTime()}`,
    eventType: "message_received", recipientUserId, recipientEmail: recipient.email.trim().toLowerCase(),
    payload: { recipientRole, conversationId: conversation._id },
    nextAttemptAt: new Date(clock.getTime() + MESSAGE_EMAIL_POLICY.delayMs),
  }], { session });
  return job;
}

// Recheck unread state, account ownership and mailbox routing at dispatch time.
// No message body or sender contact is copied into the durable email payload.
export async function shouldDeliverMessageAlert(job) {
  const conversation = await Conversation.findById(job.payload?.conversationId).lean().maxTimeMS(5000);
  if (!conversation || !same(conversation.bookingId, job.bookingId)) return false;
  const role = job.payload.recipientRole;
  if (!["customer", "vendor"].includes(role)) return false;
  const target = role === "customer" ? conversation.customerId : conversation.vendorUserId;
  if (!same(target, job.recipientUserId) || !(conversation[`${role}UnreadCount`] > 0)) return false;
  const recipient = await User.findById(target)
    .select("email role accountStatus suspendedAt emailVerifiedAt notificationPreferences").lean().maxTimeMS(5000);
  if (!recipient || recipient.role !== role || !emailAllowed(recipient) ||
      recipient.email?.trim().toLowerCase() !== job.recipientEmail) return false;
  const booking = await Booking.findById(job.bookingId).select("customerId vendorId").lean().maxTimeMS(5000);
  if (!booking || !same(booking.customerId, conversation.customerId) || !same(booking.vendorId, conversation.vendorId)) return false;
  const vendor = await Vendor.findById(booking.vendorId).select("userId").lean().maxTimeMS(5000);
  return Boolean(vendor && same(vendor.userId, conversation.vendorUserId));
}
