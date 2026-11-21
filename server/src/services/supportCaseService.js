import mongoose from "mongoose";
import { createHash } from "node:crypto";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import Booking from "../models/Booking.js";
import SupportCase, { SUPPORT_CASE_CATEGORIES, SUPPORT_CASE_STATUSES, ACTIVE_SUPPORT_CASE_STATUSES } from "../models/SupportCase.js";
import SupportCaseEvent from "../models/SupportCaseEvent.js";
import ApiError from "../utils/ApiError.js";
import { isActiveAccount } from "../utils/accountEligibility.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { lockAccountForBooking, lockVendorForBooking, withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { acceptedAgreementView } from "./quotationViewService.js";
import { bookingView, populateBooking } from "./bookingViewService.js";
import { supportCaseView, supportCaseEventView } from "./supportCaseViewService.js";
import { enqueueSupportCaseEmails } from "./supportNotificationService.js";

const identity = value => String(value?._id || value || "");
const hash = value => createHash("sha256").update(value).digest("hex");
const conflict = () => new ApiError(409, "The support case changed. Reload it before making this update.");
const rates = new Map();
function consumeRate(actor, kind) {
  const policies = { read: [120, 60000], create: [10, 900000], update: actor.role === "admin" ? [120, 60000] : [30, 900000] };
  const now = Date.now();
  for (const [key, row] of rates) if (row.until <= now) rates.delete(key);
  const key = `${identity(actor)}:${kind}`;
  let row = rates.get(key);
  if (!row) {
    if (rates.size >= 10000) throw new ApiError(429, "Support is busy. Please try again shortly.");
    row = { count: 0, until: now + policies[kind][1] }; rates.set(key, row);
  }
  if (++row.count > policies[kind][0]) throw new ApiError(429, "Too many support requests. Please try again shortly.");
}
export function resetSupportCaseRatesForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Support rate reset is test-only.");
  rates.clear();
}
export function supportId(value, label = "support case id") {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) throw new ApiError(400, `Invalid ${label}.`);
  return value.toLowerCase();
}
export function supportRevision(value) {
  const revision = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER)
    throw new ApiError(400, "Provide the inspected support case revision.");
  return revision;
}
export function supportText(value, label, maximum = 4000) {
  if (typeof value !== "string" || value.length > maximum) throw new ApiError(400, `${label} must be text up to ${maximum} characters.`);
  const text = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!text) throw new ApiError(400, `${label} is required.`);
  return text;
}
export function supportCaseRequestKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(value))
    throw new ApiError(400, "Provide an Idempotency-Key of 16 to 128 safe ASCII characters.");
  return hash(value);
}
function fields(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)))
    throw new ApiError(400, "Support data contains unsupported fields.");
}
async function currentActor(actor, session = null) {
  if (!actor || !["customer", "vendor", "admin"].includes(actor.role) || !/^[a-f0-9]{24}$/i.test(identity(actor)))
    throw new ApiError(403, "Authentication is required for support.");
  const current = await User.findById(actor._id).session(session);
  if (!isActiveAccount(current)) throw new ApiError(403, "This account is unavailable.");
  if (current.role !== actor.role || (current.authVersion || 0) !== (actor.authVersion || 0))
    throw new ApiError(401, "Your account changed. Please log in again.");
  return current;
}
export async function lockSupportCaseActor(actor, session, { verified = true } = {}) {
  const current = await lockAccountForBooking(actor._id, session);
  if (current.role !== actor.role || (current.authVersion || 0) !== (actor.authVersion || 0))
    throw new ApiError(401, "Your account changed. Please log in again.");
  if (verified) assertVerifiedEmail(current);
  return current;
}
async function bookingAccess(bookingId, actor, { session = null, write = false } = {}) {
  supportId(bookingId, "booking id");
  const current = await currentActor(actor, session);
  const booking = await Booking.findById(bookingId).session(session).lean();
  if (!booking) throw new ApiError(404, "Booking not found.");
  const vendor = /^[a-f0-9]{24}$/i.test(identity(booking.vendorId)) ? await Vendor.findById(booking.vendorId).session(session).lean() : null;
  const selfRole = current.role === "admin" ? "admin" : current.role === "customer" && identity(booking.customerId) === identity(current) ? "customer"
    : current.role === "vendor" && vendor && identity(vendor.userId) === identity(current) ? "vendor" : null;
  if (!selfRole) throw new ApiError(403, "You cannot access support for this booking.");
  if (write && selfRole !== "admin") assertVerifiedEmail(current);
  return { booking, vendor, selfRole, currentActor: current };
}
export async function authorizeSupportCaseAccess(caseId, actor, { write = false, session = null } = {}) {
  supportId(caseId);
  const current = await currentActor(actor, session);
  const supportCase = await SupportCase.findById(caseId).session(session);
  if (!supportCase) throw new ApiError(404, "Support case not found.");
  const booking = await Booking.findById(supportCase.bookingId).session(session).lean();
  const vendor = booking && /^[a-f0-9]{24}$/i.test(identity(booking.vendorId))
    ? await Vendor.findById(booking.vendorId).session(session).lean() : null;
  let selfRole = current.role === "admin" ? "admin" : null;
  if (booking && identity(booking._id) === identity(supportCase.bookingId) && identity(booking.customerId) === identity(supportCase.customerId) &&
      identity(booking.vendorId) === identity(supportCase.vendorId)) {
    if (current.role === "customer" && identity(booking.customerId) === identity(current)) selfRole = "customer";
    if (current.role === "vendor" && vendor && identity(vendor.userId) === identity(current) && identity(supportCase.vendorUserId) === identity(current)) selfRole = "vendor";
  }
  if (!selfRole) throw new ApiError(403, "You cannot access this support case.");
  if (write) {
    if (selfRole !== "admin") assertVerifiedEmail(current);
    if (supportCase.status === "closed") throw new ApiError(409, "This case is closed. Ask support to reopen it before adding updates or evidence.");
  }
  return { supportCase, booking, vendor, selfRole, currentActor: current };
}
const renderedBooking = async (bookingId, actor) => {
  const booking = await populateBooking(Booking.findById(bookingId)).lean();
  return booking ? bookingView(booking, actor) : null;
};
async function createEvent(supportCase, actor, data, session, eventId = new mongoose.Types.ObjectId()) {
  const [event] = await SupportCaseEvent.create([{ _id: eventId, caseId: supportCase._id, sequence: supportCase.revision,
    actorId: actor._id, actorRole: actor.role, ...data }], { session });
  if (event.visibility === "participants") await enqueueSupportCaseEmails({ supportCase, event, session });
  return event;
}

export async function createSupportCase(bookingId, actor, body, key) {
  fields(body, ["category", "subject", "description"]);
  if (!SUPPORT_CASE_CATEGORIES.includes(body.category)) throw new ApiError(400, "Choose a supported case category.");
  const content = { category: body.category, subject: supportText(body.subject, "Case subject", 160), description: supportText(body.description, "Case description") };
  const creationKeyHash = supportCaseRequestKey(key), creationRequestHash = hash(JSON.stringify({ bookingId: supportId(bookingId, "booking id"), ...content }));
  const initial = await bookingAccess(bookingId, actor, { write: true });
  if (initial.selfRole === "admin") throw new ApiError(403, "Only booking customers and vendors can open cases.");
  consumeRate(actor, "create");
  const caseId = new mongoose.Types.ObjectId(), eventId = new mongoose.Types.ObjectId();
  const lookupReplay = async session => {
    const previous = await SupportCase.findOne({ openedById: actor._id, creationKeyHash }).select("+creationRequestHash").session(session || null);
    if (previous && previous.creationRequestHash !== creationRequestHash) throw new ApiError(409, "This Idempotency-Key was already used for different support data.");
    return previous;
  };
  let result;
  try {
    result = await withBookingTransaction(async session => {
      await lockSupportCaseActor(actor, session);
      const access = await bookingAccess(bookingId, actor, { write: true, session });
      if (access.vendor) await lockVendorForBooking(access.vendor._id, session);
      const previous = await lookupReplay(session);
      if (previous) return { supportCase: previous, replayed: true };
      if (await SupportCase.countDocuments({ bookingId: access.booking._id }).session(session) >= 100)
        throw new ApiError(409, "This booking has reached its support case limit. Use an existing case.");
      if (await SupportCase.exists({ bookingId: access.booking._id, category: content.category, status: { $in: ACTIVE_SUPPORT_CASE_STATUSES } }).session(session))
        throw new ApiError(409, "An active case already covers this category. Use its existing timeline.");
      const [supportCase] = await SupportCase.create([{
        _id: caseId, bookingId: access.booking._id, customerId: access.booking.customerId,
        vendorId: access.booking.vendorId, vendorUserId: access.vendor?.userId || null,
        openedById: actor._id, openedByRole: actor.role, ...content, bookingStatusAtOpen: access.booking.status,
        ...(access.booking.acceptedAgreement ? { agreementSnapshot: acceptedAgreementView(access.booking.acceptedAgreement) } : {}),
        creationKeyHash, creationRequestHash,
      }], { session });
      await createEvent(supportCase, actor, { kind: "created", visibility: "participants", body: "Support case opened.", status: "open" }, session, eventId);
      return { supportCase, replayed: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const previous = await lookupReplay();
    if (!previous) throw new ApiError(409, "An active case already covers this category. Reload support cases.");
    result = { supportCase: previous, replayed: true };
  }
  return { case: supportCaseView(result.supportCase, actor), replayed: result.replayed };
}

export async function listBookingSupportCases(bookingId, actor) {
  await bookingAccess(bookingId, actor);
  consumeRate(actor, "read");
  const rows = await SupportCase.find({ bookingId }).sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  // Recheck each stored participant association rather than trusting snapshots.
  const authorized = [];
  for (const row of rows) {
    try { await authorizeSupportCaseAccess(identity(row._id), actor); authorized.push(supportCaseView(row, actor)); }
    catch (error) { if (error.statusCode !== 403) throw error; }
  }
  return { cases: authorized };
}
export async function getSupportCase(caseId, actor) {
  const access = await authorizeSupportCaseAccess(caseId, actor);
  consumeRate(actor, "read");
  return { case: supportCaseView(access.supportCase, actor), booking: await renderedBooking(access.supportCase.bookingId, actor) };
}
function positiveInteger(value, fallback, maximum, name) {
  if (value === undefined) return fallback;
  const parsed = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new ApiError(400, `${name} is invalid.`);
  return parsed;
}
export async function getSupportCaseEvents(caseId, actor, query = {}) {
  fields(query, ["before", "limit"]);
  await authorizeSupportCaseAccess(caseId, actor);
  consumeRate(actor, "read");
  const limit = positiveInteger(query.limit, 30, 50, "Timeline limit");
  const before = query.before === undefined ? null : supportRevision(query.before);
  const rows = await SupportCaseEvent.find({ caseId, ...(actor.role === "admin" ? {} : { visibility: "participants" }),
    ...(before ? { sequence: { $lt: before } } : {}) }).select(actor.role === "admin" ? "+assignedAdminId" : "")
    .sort({ sequence: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { events: page.map(row => supportCaseEventView(row, actor)).filter(Boolean),
    pagination: { hasMore, nextBefore: page[0]?.sequence || null } };
}

export async function addSupportCaseUpdate(caseId, actor, body, { privateNote = false } = {}) {
  fields(body, ["revision", "body"]);
  const revision = supportRevision(body.revision), text = supportText(body.body, privateNote ? "Private note" : "Case update");
  if (privateNote && actor.role !== "admin") throw new ApiError(403, "Only administrators may add private notes.");
  await authorizeSupportCaseAccess(caseId, actor, { write: !privateNote });
  consumeRate(actor, "update");
  const eventId = new mongoose.Types.ObjectId();
  return withBookingTransaction(async session => {
    await lockSupportCaseActor(actor, session);
    const access = await authorizeSupportCaseAccess(caseId, actor, { write: !privateNote, session });
    const supportCase = await SupportCase.findOneAndUpdate({ _id: access.supportCase._id, revision,
      ...(!privateNote ? { status: { $ne: "closed" } } : {}) }, { $inc: { revision: 1 } }, { new: true, session, runValidators: true });
    if (!supportCase) throw conflict();
    const event = await createEvent(supportCase, actor, { kind: privateNote ? "private_note" : "comment",
      visibility: privateNote ? "admin" : "participants", body: text }, session, eventId);
    return { case: supportCaseView(supportCase, actor), event: supportCaseEventView(event, actor) };
  });
}

export async function listAdminSupportCases(actor, query = {}) {
  fields(query, ["status", "category", "assignedTo", "page", "limit", "search"]);
  const current = await currentActor(actor);
  if (current.role !== "admin") throw new ApiError(403, "Administrator access is required.");
  consumeRate(actor, "read");
  const filter = {};
  if (query.status !== undefined) {
    if (!SUPPORT_CASE_STATUSES.includes(query.status)) throw new ApiError(400, "Invalid support status filter.");
    filter.status = query.status;
  }
  if (query.category !== undefined) {
    if (!SUPPORT_CASE_CATEGORIES.includes(query.category)) throw new ApiError(400, "Invalid support category filter.");
    filter.category = query.category;
  }
  if (query.assignedTo !== undefined) {
    filter.assignedAdminId = query.assignedTo === "me" ? current._id : query.assignedTo === "unassigned" ? null : new mongoose.Types.ObjectId(supportId(query.assignedTo, "administrator id"));
  }
  if (query.search !== undefined) {
    const search = supportText(query.search, "Search", 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.subject = { $regex: search, $options: "i" };
  }
  const page = positiveInteger(query.page, 1, 10000, "Page"), limit = positiveInteger(query.limit, 25, 50, "Page limit");
  const [rows, total] = await Promise.all([
    SupportCase.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean().maxTimeMS(5000),
    SupportCase.countDocuments(filter).maxTimeMS(5000),
  ]);
  return { cases: rows.map(row => supportCaseView(row, actor)), pagination: {
    page, pages: Math.ceil(total / limit), total, hasNextPage: page * limit < total,
  } };
}

const transitions = { open: ["investigating", "resolved"], investigating: ["resolved"], resolved: ["closed", "investigating"], closed: ["investigating"] };
export async function manageSupportCase(caseId, actor, body) {
  fields(body, ["revision", "status", "assignedAdminId", "reason", "resolution"]);
  if (actor.role !== "admin") throw new ApiError(403, "Administrator access is required.");
  const revision = supportRevision(body.revision), assignment = Object.hasOwn(body, "assignedAdminId");
  if (assignment && (body.status !== undefined || body.reason !== undefined || body.resolution !== undefined))
    throw new ApiError(400, "Assign the case and change its status in separate operations.");
  if (!assignment && !SUPPORT_CASE_STATUSES.includes(body.status)) throw new ApiError(400, "Choose a support case status.");
  const targetId = assignment && body.assignedAdminId !== null ? supportId(body.assignedAdminId, "administrator id") : null;
  const reason = body.reason === undefined ? "" : supportText(body.reason, "Case reason");
  const resolution = body.resolution === undefined ? "" : supportText(body.resolution, "Resolution decision");
  await authorizeSupportCaseAccess(caseId, actor);
  consumeRate(actor, "update");
  const eventId = new mongoose.Types.ObjectId();
  try {
    return await withBookingTransaction(async session => {
      // Stable account order also covers opposing assignments by two admins.
      for (const accountId of [...new Set([identity(actor), targetId].filter(Boolean))].sort()) {
        const account = await lockAccountForBooking(accountId, session);
        if (accountId === identity(actor) && (account.role !== "admin" || (account.authVersion || 0) !== (actor.authVersion || 0)))
          throw new ApiError(401, "Your account changed. Please log in again.");
        if (accountId === targetId && account.role !== "admin") throw new ApiError(400, "Assign cases to an active administrator only.");
      }
      const access = await authorizeSupportCaseAccess(caseId, actor, { session });
      const previous = access.supportCase;
      const changes = {};
      let data;
      if (assignment) {
        if (identity(previous.assignedAdminId) === (targetId || "")) throw new ApiError(409, "This assignment is already current.");
        changes.assignedAdminId = targetId;
        data = { kind: "assigned", visibility: "participants", assignedAdminId: targetId,
          body: targetId ? "The case was assigned to support." : "The case was returned to the unassigned support queue." };
      } else {
        if (!transitions[previous.status]?.includes(body.status)) throw new ApiError(409, "This case cannot make the requested status transition.");
        const reopening = body.status === "investigating" && ["resolved", "closed"].includes(previous.status);
        if (body.status === "resolved" && !resolution) throw new ApiError(400, "Record a resolution decision before resolving the case.");
        if (reopening && !reason) throw new ApiError(400, "Record a reason before reopening the case.");
        if (resolution && body.status !== "resolved") throw new ApiError(400, "A resolution decision is only accepted while resolving the case.");
        changes.status = body.status;
        if (body.status === "resolved") { changes.resolution = resolution; changes.resolvedAt = new Date(); }
        if (body.status === "closed") changes.closedAt = new Date();
        if (reopening) { changes.closedAt = null; changes.resolvedAt = null; }
        data = { kind: reopening ? "reopened" : body.status === "resolved" ? "resolved" : body.status === "closed" ? "closed" : "status_changed",
          visibility: "participants", previousStatus: previous.status, status: body.status,
          body: body.status === "resolved" ? resolution : reason || (body.status === "closed" ? "The support case was closed." : "Support is investigating this case.") };
      }
      const supportCase = await SupportCase.findOneAndUpdate({ _id: previous._id, revision },
        { $set: changes, $inc: { revision: 1 } }, { new: true, session, runValidators: true });
      if (!supportCase) throw conflict();
      const event = await createEvent(supportCase, actor, data, session, eventId);
      return { case: supportCaseView(supportCase, actor), event: supportCaseEventView(event, actor) };
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "Another active case covers this booking/category. Resolve that case before reopening this one.");
    throw error;
  }
}
