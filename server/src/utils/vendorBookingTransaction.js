import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";
import ApiError from "./ApiError.js";

// Acceptance and date-block changes must contend on the same document. Merely
// reading each other's collections in snapshot transactions permits write skew.
// The driver's withTransaction retries transient conflicts; keep callbacks free
// of HTTP responses or other external side effects.
export async function withBookingTransaction(operation) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => operation(session), {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }
}

export function withVendorBookingTransaction(vendorId, operation, ownerId) {
  return withBookingTransaction(async (session) => {
    const filter = { _id: vendorId };
    if (ownerId) filter.userId = ownerId;
    const vendor = await Vendor.findOneAndUpdate(
      filter,
      { $inc: { bookingRevision: 1 } },
      { new: true, session, timestamps: false },
    );
    if (!vendor) throw new ApiError(404, "Vendor not found.");
    return operation(session, vendor);
  });
}
