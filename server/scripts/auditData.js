import "dotenv/config";
import mongoose from "mongoose";
import { auditBookingDates } from "../src/utils/bookingDataAudit.js";

// Read-only pre-deployment report. This script never migrates or deletes data.
async function audit() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const bookings = mongoose.connection.collection("bookings");
  const vendors = mongoose.connection.collection("vendors");
  const availabilities = mongoose.connection.collection("availabilities");
  const [
    bookingDates,
    legacyVendorApprovals,
    retiredAvailabilityRules,
  ] = await Promise.all([
    auditBookingDates(bookings),
    vendors.countDocuments({ verificationStatus: { $exists: false } }),
    availabilities.countDocuments({
      $or: [
        { "businessHours.0": { $exists: true } },
        { "blockedTimeSlots.0": { $exists: true } },
        { "vacations.0": { $exists: true } },
      ],
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        ...bookingDates,
        vendorsUsingLegacyApproval: legacyVendorApprovals,
        availabilityRecordsWithRetiredRules: retiredAvailabilityRules,
        actions: [
          "Back up the database before any operator-approved migration.",
          "Backfill eventDateOnly from eventDate as YYYY-MM-DD (UTC) before building the reservation index.",
          "Review invalid eventDate values and malformed/mismatched date keys; the audit returns at most 20 ID-only issue samples.",
          "Resolve duplicate confirmed vendor/date reservations manually; do not automatically cancel customer bookings.",
          "Review retired time/vacation rules and replace with explicit unavailableDates when needed.",
          "Retired feature collections and fields are preserved; review retention separately.",
        ],
      },
      null,
      2,
    ),
  );
  if (
    bookingDates.bookingsMissingDateKeys || bookingDates.bookingsInvalidDates ||
    bookingDates.bookingsInvalidDateKeys || bookingDates.bookingsMismatchedDateKeys ||
    bookingDates.duplicateReservations.length
  ) process.exitCode = 1;
}

audit()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
