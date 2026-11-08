import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";
import User from "../models/User.js";
import { activeAccountFilter } from "./accountEligibility.js";
import ApiError from "./ApiError.js";
import { performance } from "node:perf_hooks";
import { errorCategory, logEvent } from "./logger.js";

// Acceptance and date-block changes must contend on the same document. Merely
// reading each other's collections in snapshot transactions permits write skew.
// The driver's withTransaction retries transient conflicts; keep callbacks free
// of HTTP responses or other external side effects.
export async function withBookingTransaction(operation) {
  const started = performance.now();
  let session;
  let attempts = 0;
  try {
    session = await mongoose.startSession();
    const result = await session.withTransaction(() => {
      attempts += 1;
      return operation(session);
    }, {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10000,
    });
    if (attempts > 1) logEvent("info", "booking_transaction_retried", { attempts });
    return result;
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) logEvent("error", "booking_transaction_failed", { attempts, category: errorCategory(error) });
    throw error;
  } finally {
    if (session) await session.endSession();
    const durationMs = Math.round(performance.now() - started);
    if (durationMs >= Number(process.env.SLOW_REQUEST_MS || 1000)) logEvent("warn", "booking_transaction_slow", { durationMs, attempts });
  }
}

export function withVendorBookingTransaction(vendorId, operation, ownerId) {
  return withBookingTransaction(async (session) => {
    const vendor = await lockVendorForBooking(vendorId, session, ownerId);
    return operation(session, vendor);
  });
}

export async function lockVendorForBooking(vendorId, session, ownerId) {
  const filter = { _id: vendorId };
  if (ownerId) filter.userId = ownerId;
  const vendor = await Vendor.findOneAndUpdate(filter, { $inc: { bookingRevision: 1 } }, { new: true, session, timestamps: false });
  if (!vendor) throw new ApiError(404, "Vendor not found.");
  return vendor;
}

export async function lockAccountForBooking(userId, session) {
  const user = await User.findOneAndUpdate(
    { _id: userId, ...activeAccountFilter() },
    { $inc: { bookingGuardRevision: 1 } },
    { new: true, session, timestamps: false },
  );
  if (!user) throw new ApiError(403, "This account is unavailable.");
  return user;
}
