import mongoose from "mongoose";
import Vendor from "../models/Vendor.js";
import ApiError from "./ApiError.js";

// Acceptance and date-block changes must contend on the same document. Merely
// reading each other's collections in snapshot transactions permits write skew.
// The driver's withTransaction retries transient conflicts; keep callbacks free
// of HTTP responses or other external side effects.
export async function withVendorBookingTransaction(vendorId, operation, ownerId) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const filter = { _id: vendorId };
      if (ownerId) filter.userId = ownerId;
      const vendor = await Vendor.findOneAndUpdate(
        filter,
        { $inc: { bookingRevision: 1 } },
        { new: true, session, timestamps: false },
      );
      if (!vendor) throw new ApiError(404, "Vendor not found.");
      return operation(session, vendor);
    }, {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }
}
