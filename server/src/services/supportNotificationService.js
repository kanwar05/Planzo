import NotificationOutbox from "../models/NotificationOutbox.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import SupportCase from "../models/SupportCase.js";
import { isActiveAccount } from "../utils/accountEligibility.js";
import { hasVerifiedEmail } from "../utils/emailVerification.js";
import { validateEmail } from "../utils/validation.js";

const same = (left, right) => String(left || "") === String(right || "");
const eventTypes = {
  created: "support_case_created", assigned: "support_case_assigned", resolved: "support_case_resolved",
  closed: "support_case_closed", reopened: "support_case_reopened", status_changed: "support_case_updated",
  comment: "support_case_updated", evidence_added: "support_case_updated",
};
const eligible = (user, role) => isActiveAccount(user) && user.role === role &&
  (role === "admin" || hasVerifiedEmail(user)) && user.notificationPreferences?.bookingUpdates !== false;

export async function enqueueSupportCaseEmails({ supportCase, event, session }) {
  if (!session?.inTransaction()) throw new Error("Support notifications must share the support transaction.");
  if (event.visibility !== "participants" || event.kind === "private_note") return [];
  const eventType = eventTypes[event.kind];
  if (!eventType) throw new Error("Unsupported support notification event.");
  const targets = [
    [supportCase.customerId, "customer"], [supportCase.vendorUserId, "vendor"],
    ...(event.kind === "assigned" && supportCase.assignedAdminId ? [[supportCase.assignedAdminId, "admin"]] : []),
  ];
  const records = [], seen = new Set();
  for (const [userId, role] of targets) {
    if (seen.has(String(userId))) continue;
    seen.add(String(userId));
    const user = await User.findById(userId)
      .select("role email emailVerifiedAt accountStatus suspendedAt notificationPreferences").session(session).lean();
    if (!user || !eligible(user, role)) continue;
    try { validateEmail(user.email); } catch { continue; }
    records.push({ bookingId: supportCase.bookingId, eventId: `support:${event._id}`, eventType,
      recipientUserId: userId, recipientEmail: user.email.trim().toLowerCase(),
      payload: { recipientRole: role, supportCaseId: supportCase._id } });
  }
  return records.length ? NotificationOutbox.insertMany(records, { session }) : [];
}

// Only routing references enter email payloads. Check the current case audience
// and mailbox again immediately before dispatch, without reading private notes.
export async function shouldDeliverSupportAlert(job) {
  const record = await SupportCase.findById(job.payload?.supportCaseId).lean().maxTimeMS(5000);
  if (!record || !same(record.bookingId, job.bookingId)) return false;
  const role = job.payload?.recipientRole;
  const recipientId = role === "customer" ? record.customerId : role === "vendor" ? record.vendorUserId
    : role === "admin" ? record.assignedAdminId : null;
  if (!recipientId || !same(recipientId, job.recipientUserId)) return false;
  const user = await User.findById(recipientId)
    .select("role email emailVerifiedAt accountStatus suspendedAt notificationPreferences").lean().maxTimeMS(5000);
  if (!user || !eligible(user, role) || user.email?.trim().toLowerCase() !== job.recipientEmail) return false;
  if (role === "admin") return true;
  const booking = await Booking.findById(record.bookingId).select("customerId vendorId").lean().maxTimeMS(5000);
  if (!booking || !same(booking.customerId, record.customerId) || !same(booking.vendorId, record.vendorId)) return false;
  if (role === "customer") return true;
  const vendor = await Vendor.findById(record.vendorId).select("userId").lean().maxTimeMS(5000);
  return Boolean(vendor && same(vendor.userId, record.vendorUserId));
}
