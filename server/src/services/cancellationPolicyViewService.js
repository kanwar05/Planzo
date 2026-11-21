import ApiError from "../utils/ApiError.js";
import { storedBookingDay } from "../utils/bookingDates.js";

const consequences = "Cancellation closes the booking and releases its reserved date. No payment is processed and no refund, fee or payout is calculated or promised. Contact support for disagreements.";
export const defaultCancellationPolicy = () => ({
  key: "standard", version: 1, title: "Standard cancellation policy",
  description: "Pending requests may be cancelled while pending. After quotation acceptance, customer and vendor cancellation is available before the cutoff 48 hours before 00:00 IST (Asia/Kolkata) on the booked event date. Vendors must provide a reason. Contact support after the cutoff.",
  timeZone: "Asia/Kolkata",
  customerPendingCutoffHours: null, customerAcceptedCutoffHours: 48, vendorCutoffHours: 48, consequences,
});
export const legacyCancellationPolicy = () => ({
  key: "legacy", version: 0, title: "Legacy cancellation terms",
  description: "This booking or quotation predates versioned cancellation terms. Existing customer cancellation timing remains available while pending or accepted. Vendor cancellation requires a reason. Completed, rejected and cancelled bookings cannot be cancelled again.",
  timeZone: "UTC",
  customerPendingCutoffHours: null, customerAcceptedCutoffHours: null, vendorCutoffHours: null, consequences,
});
export function cancellationPolicyView(input) {
  const source = typeof input?.toObject === "function" ? input.toObject() : input;
  if (!source || typeof source !== "object" || Array.isArray(source) ||
      !["standard", "legacy"].includes(source.key) || !Number.isSafeInteger(source.version) || source.version < 0 || source.version > 100)
    return null;
  if (source.key === "legacy" ? source.version !== 0 : source.version < 1) return null;
  const result = { key: source.key, version: source.version };
  const timeZone = source.timeZone ?? "UTC";
  if (!["UTC", "Asia/Kolkata"].includes(timeZone)) return null;
  result.timeZone = timeZone;
  for (const [field, maximum] of [["title", 120], ["description", 2000], ["consequences", 2000]]) {
    if (typeof source[field] !== "string" || !source[field].trim() || source[field].length > maximum) return null;
    result[field] = source[field];
  }
  for (const field of ["customerPendingCutoffHours", "customerAcceptedCutoffHours", "vendorCutoffHours"]) {
    if (source[field] !== null && (!Number.isSafeInteger(source[field]) || source[field] < 0 || source[field] > 8760)) return null;
    result[field] = source[field];
  }
  return result;
}

export function effectivePolicyForBooking(booking) {
  const accepted = booking.acceptedAgreement;
  if (booking.status !== "pending" && accepted?.cancellationPolicy) {
    const policy = cancellationPolicyView(accepted.cancellationPolicy);
    if (!policy) throw new ApiError(409, "The accepted cancellation policy needs operator review.");
    return { policy, source: "accepted", acknowledgedAt: accepted.cancellationPolicyAcknowledgedAt || null };
  }
  if (booking.status === "pending" && booking.requestCancellationPolicy) {
    const policy = cancellationPolicyView(booking.requestCancellationPolicy);
    if (!policy) throw new ApiError(409, "The request cancellation policy needs operator review.");
    return { policy, source: "pending", acknowledgedAt: null };
  }
  return { policy: legacyCancellationPolicy(), source: "legacy", acknowledgedAt: null };
}
export function cancellationEligibility(booking, policy, now = new Date()) {
  const mutable = ["pending", "accepted"].includes(booking.status);
  const timeZone = policy.timeZone ?? "UTC";
  if (!["UTC", "Asia/Kolkata"].includes(timeZone)) throw new ApiError(409, "The cancellation policy time zone needs operator review.");
  const customerHours = booking.status === "pending" ? policy.customerPendingCutoffHours : policy.customerAcceptedCutoffHours;
  const cutoff = hours => {
    if (hours === null) return null;
    // The booked label remains the canonical UTC date; only cancellation's
    // day-start reference is interpreted in the frozen policy time zone.
    const offset = timeZone === "Asia/Kolkata" ? "+05:30" : "Z";
    return new Date(new Date(`${storedBookingDay(booking)}T00:00:00.000${offset}`).getTime() - hours * 3600000);
  };
  const customerCutoffAt = cutoff(customerHours), vendorCutoffAt = cutoff(policy.vendorCutoffHours);
  const eligible = at => mutable && (!at || now.getTime() < at.getTime());
  const customerCanCancel = eligible(customerCutoffAt), vendorCanCancel = eligible(vendorCutoffAt);
  return { customerCanCancel, vendorCanCancel, adminCanCancel: mutable,
    adminOverrideRequired: mutable && (!customerCanCancel || !vendorCanCancel),
    customerCutoffAt, vendorCutoffAt,
    customerReason: !mutable ? "This booking is in a terminal state." : !customerCanCancel ? "The customer cancellation cutoff has passed. Contact support." : "",
    vendorReason: !mutable ? "This booking is in a terminal state." : !vendorCanCancel ? "The vendor cancellation cutoff has passed. Contact support." : "",
  };
}
const identifier = value => {
  const text = typeof value === "string" ? value : value?._bsontype === "ObjectId" && typeof value.toHexString === "function" ? value.toHexString() : "";
  return /^[a-f0-9]{24}$/i.test(text) ? text : null;
};
export function cancellationRecordView(input, { admin = false } = {}) {
  const source = typeof input?.toObject === "function" ? input.toObject() : input;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const result = {};
  if (identifier(source.cancellationId)) result.cancellationId = identifier(source.cancellationId);
  if (admin && identifier(source.cancelledById)) result.cancelledById = identifier(source.cancelledById);
  if (["customer", "vendor", "admin"].includes(source.cancelledByRole)) result.cancelledByRole = source.cancelledByRole;
  if (source.cancelledAt instanceof Date && Number.isFinite(source.cancelledAt.getTime())) result.cancelledAt = source.cancelledAt;
  if (["pending", "accepted"].includes(source.previousStatus)) result.previousStatus = source.previousStatus;
  if (typeof source.reason === "string") result.reason = source.reason.slice(0, 1000);
  if (["accepted", "legacy", "pending"].includes(source.policySource)) result.policySource = source.policySource;
  const policy = cancellationPolicyView(source.policySnapshot);
  if (policy) result.policySnapshot = policy;
  result.overridePolicy = source.overridePolicy === true;
  return result;
}
