import CancellationPolicy from "../models/CancellationPolicy.js";
import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import { lockAccountForBooking, withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { cancellationPolicyView, defaultCancellationPolicy, effectivePolicyForBooking, cancellationEligibility } from "./cancellationPolicyViewService.js";
export { cancellationPolicyView, defaultCancellationPolicy, legacyCancellationPolicy, effectivePolicyForBooking, cancellationEligibility } from "./cancellationPolicyViewService.js";

export async function currentCancellationPolicy(session = null) {
  const latest = await CancellationPolicy.findOne().sort({ version: -1 }).session(session);
  if (!latest) return defaultCancellationPolicy();
  const policy = cancellationPolicyView(latest);
  if (!policy) throw new ApiError(409, "The active cancellation policy needs operator review.");
  return policy;
}
const fields = ["title", "description", "timeZone", "customerPendingCutoffHours", "customerAcceptedCutoffHours", "vendorCutoffHours", "consequences"];
function text(value, maximum, field) {
  if (typeof value !== "string" || value.length > maximum) throw new ApiError(400, `${field} must be text up to ${maximum} characters.`);
  const clean = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!clean) throw new ApiError(400, `${field} is required.`);
  return clean;
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => ![...fields, "expectedVersion"].includes(key)))
    throw new ApiError(400, "Provide supported cancellation policy fields only.");
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 || body.expectedVersion > 100)
    throw new ApiError(400, "Provide the inspected policy version.");
  const result = {};
  if (body.timeZone !== undefined && body.timeZone !== "Asia/Kolkata")
    throw new ApiError(400, "New cancellation policies must use Asia/Kolkata (IST).");
  result.timeZone = "Asia/Kolkata";
  for (const [field, maximum] of [["title", 120], ["description", 2000], ["consequences", 2000]]) result[field] = text(body[field], maximum, field);
  for (const field of fields.filter(field => field.endsWith("Hours"))) {
    if (body[field] !== null && (!Number.isSafeInteger(body[field]) || body[field] < 0 || body[field] > 8760))
      throw new ApiError(400, `${field} must be null or an integer from 0 to 8760.`);
    result[field] = body[field];
  }
  return result;
}
export async function publishCancellationPolicy(actor, body) {
  if (actor.role !== "admin") throw new ApiError(403, "Only administrators may publish cancellation policies.");
  const content = validate(body);
  try {
    return await withBookingTransaction(async session => {
      const current = await lockAccountForBooking(actor._id, session);
      if (current.role !== "admin" || (current.authVersion || 0) !== (actor.authVersion || 0)) throw new ApiError(401, "Your account changed. Please sign in again.");
      const previous = await currentCancellationPolicy(session);
      if (previous.version !== body.expectedVersion) throw new ApiError(409, "The active policy changed. Reload before publishing.");
      if (previous.version >= 100) throw new ApiError(409, "The policy version limit has been reached.");
      const [created] = await CancellationPolicy.create([{ key: "standard", version: previous.version + 1, ...content, publishedById: actor._id }], { session });
      return cancellationPolicyView(created);
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "Another administrator published a policy. Reload before publishing.");
    throw error;
  }
}
export async function cancellationPolicyHistory(query = {}) {
  if (!query || Object.keys(query).some(key => !["limit", "beforeVersion"].includes(key))) throw new ApiError(400, "Unsupported policy history query.");
  const parse = value => typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  const limit = query.limit === undefined ? 20 : parse(query.limit), before = query.beforeVersion === undefined ? 101 : parse(query.beforeVersion);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(before) || before < 2 || before > 101)
    throw new ApiError(400, "Use limit 1–50 and beforeVersion 2–101.");
  const rows = await CancellationPolicy.find({ version: { $lt: before } }).sort({ version: -1 }).limit(limit + 1);
  const values = rows.map(cancellationPolicyView);
  if (rows.length <= limit && !rows.some(row => row.version === 1)) values.push(defaultCancellationPolicy());
  const policies = values.slice(0, limit);
  return { policies, activePolicy: await currentCancellationPolicy(), pagination: { hasMore: values.length > limit, nextBefore: policies.at(-1)?.version || null } };
}
export async function bookingCancellationPolicy(bookingId, actor) {
  if (typeof bookingId !== "string" || !/^[a-f0-9]{24}$/i.test(bookingId)) throw new ApiError(400, "Invalid booking id.");
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const vendor = await Vendor.findById(booking.vendorId).select("userId");
  const same = value => String(value || "") === String(actor._id);
  if (actor.role !== "admin" && !(actor.role === "customer" && same(booking.customerId)) && !(actor.role === "vendor" && same(vendor?.userId)))
    throw new ApiError(403, "You cannot access this booking's cancellation policy.");
  const effective = effectivePolicyForBooking(booking);
  return { ...effective, eligibility: cancellationEligibility(booking, effective.policy) };
}
