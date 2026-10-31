import { randomUUID } from "node:crypto";
import NotificationOutbox from "../models/NotificationOutbox.js";
import { sendBookingEmail } from "./bookingEmailService.js";

export const BOOKING_EMAIL_POLICY = Object.freeze({
  maxAttempts: 5,
  leaseMs: 120_000,
  deliveryTimeoutMs: 45_000,
  retryBaseMs: 30_000,
  retryMaxMs: 3_600_000,
});

const FAILURE_CODES = new Set([
  "ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND",
  "EAI_AGAIN", "EAUTH", "EENVELOPE", "EMESSAGE", "ESOCKET",
  "SMTP_REJECTED", "EMAIL_TIMEOUT", "EMAIL_CONFIG",
]);
const WRITE_OPTIONS = {
  maxTimeMS: 10_000,
  writeConcern: { w: "majority", wtimeoutMS: 10_000 },
};

// Never persist/log provider messages, SMTP responses, recipient addresses or
// credentials. Even error.code is untrusted unless it is on this fixed list.
export function sanitizeBookingEmailFailure(error) {
  return FAILURE_CODES.has(error?.code)
    ? `booking_email_delivery_failed:${error.code}`
    : "booking_email_delivery_failed";
}

function settings(overrides) {
  const policy = { ...BOOKING_EMAIL_POLICY, ...overrides };
  if (
    Object.values(policy).some((value) => !Number.isSafeInteger(value) || value < 1) ||
    policy.deliveryTimeoutMs >= policy.leaseMs
  ) throw new Error("Invalid booking email worker policy.");
  return policy;
}

function time(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid worker clock.");
  return date;
}

export async function claimBookingEmail({ now, policy: overrides } = {}) {
  const policy = settings(overrides);
  const claimedAt = time(now);
  // A crash on the final attempt must not leave a row processing forever.
  await NotificationOutbox.updateMany({
    status: "processing",
    attempts: { $gte: policy.maxAttempts },
    leaseExpiresAt: { $lte: claimedAt, $ne: null },
  }, {
    $set: {
      status: "failed", nextAttemptAt: null,
      lastError: "booking_email_processing_lease_expired",
    },
    $unset: { leaseToken: "", leaseExpiresAt: "" },
  }, WRITE_OPTIONS);
  return NotificationOutbox.findOneAndUpdate({
    attempts: { $lt: policy.maxAttempts },
    $or: [
      { status: { $in: ["pending", "failed"] }, nextAttemptAt: { $lte: claimedAt, $ne: null } },
      { status: "processing", leaseExpiresAt: { $lte: claimedAt, $ne: null } },
    ],
  }, {
    $set: {
      status: "processing", leaseToken: randomUUID(),
      leaseExpiresAt: new Date(claimedAt.getTime() + policy.leaseMs),
    },
    $inc: { attempts: 1 },
  }, {
    new: true, sort: { nextAttemptAt: 1, createdAt: 1, _id: 1 },
    ...WRITE_OPTIONS,
  });
}

const claimFilter = (job, now) => ({
  _id: job._id,
  status: "processing",
  leaseToken: job.leaseToken,
  leaseExpiresAt: { $gt: now },
});

async function boundedDelivery(sender, job, timeoutMs) {
  let timer;
  try {
    const info = await Promise.race([
      Promise.resolve().then(() => sender(job)),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Booking email delivery timed out.");
          error.code = "EMAIL_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
    if (
      !info?.accepted?.some((email) => String(email?.address || email).trim().toLowerCase() === job.recipientEmail.toLowerCase()) ||
      info.rejected?.length
    ) {
      const error = new Error("Booking email recipient was not accepted.");
      error.code = "SMTP_REJECTED";
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function deliverClaimedBookingEmail(job, {
  now, policy: overrides, sender = sendBookingEmail, logger = console,
} = {}) {
  const policy = settings(overrides);
  // Do not start SMTP near the end of a lease: another worker could otherwise
  // recover the claim while this bounded delivery is still in flight.
  const deliveryDeadline = new Date(time(now).getTime() + policy.deliveryTimeoutMs);
  if (!job?.leaseToken || !await NotificationOutbox.exists(claimFilter(job, deliveryDeadline)).read("primary").maxTimeMS(10_000))
    return { outcome: "stale" };
  // The ownership read can consume part of the budget. Check the clock again
  // immediately before handing the message to SMTP.
  const leaseExpiresAt = new Date(job.leaseExpiresAt).getTime();
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= time(now).getTime() + policy.deliveryTimeoutMs)
    return { outcome: "stale" };

  let failure;
  try {
    await boundedDelivery(sender, job, policy.deliveryTimeoutMs);
  } catch (error) {
    failure = sanitizeBookingEmailFailure(error);
  }

  const finishedAt = time(now);
  const changes = failure ? {
    status: "failed",
    nextAttemptAt: job.attempts < policy.maxAttempts
      ? new Date(finishedAt.getTime() + Math.min(
        policy.retryBaseMs * 2 ** (job.attempts - 1), policy.retryMaxMs,
      )) : null,
    lastError: failure,
  } : {
    status: "sent", sentAt: finishedAt, nextAttemptAt: null, lastError: "",
  };
  // Delivery may have happened even if this acknowledgement fails. Leave the
  // durable lease for recovery; never turn a database failure into a fresh send.
  const result = await NotificationOutbox.updateOne(claimFilter(job, finishedAt), {
    $set: changes,
    $unset: { leaseToken: "", leaseExpiresAt: "" },
  }, WRITE_OPTIONS);
  if (!result.modifiedCount) return { outcome: "stale" };
  if (failure) logger.warn("Booking email dispatch failed.", { category: failure });
  return { outcome: failure ? "failed" : "sent" };
}

// Every process sends serially; atomic leases allow multiple processes safely.
export async function dispatchBookingEmailBatch({
  limit = 25, now, policy, sender, logger, shouldStop = () => false,
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid booking email batch limit.");
  const results = { claimed: 0, sent: 0, failed: 0, stale: 0 };
  for (let index = 0; index < limit && !shouldStop(); index += 1) {
    const job = await claimBookingEmail({ now, policy });
    if (!job) break;
    results.claimed += 1;
    const { outcome } = await deliverClaimedBookingEmail(job, { now, policy, sender, logger });
    results[outcome] += 1;
  }
  return results;
}
