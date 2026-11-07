import mongoose from "mongoose";
import { BOOKING_STATUSES } from "../models/Booking.js";
import { safeDocumentId } from "./safeDiagnosticValues.js";

export async function assertBookingReservationFields(bookings = mongoose.connection.collection("bookings")) {
  const unsafe = await bookings.findOne({ $or: [
    { $expr: { $not: [{ $in: [{ $ifNull: ["$status", null] }, BOOKING_STATUSES] }] } },
    { $expr: { $ne: [{ $type: "$vendorId" }, "objectId"] } },
    { $expr: { $ne: [{ $type: "$customerId" }, "objectId"] } },
  ] }, { projection: { _id: 1 }, maxTimeMS: 10000 });
  if (unsafe) {
    const error = new Error("Booking reservation fields require operator review before startup.");
    error.code = "BOOKING_RESERVATIONS_UNSAFE";
    throw error;
  }
}

// A YYYY-MM-DD key can represent only these UTC dates. Checking the BSON type
// and range before formatting also handles dates outside JavaScript's range.
const MIN_DATE = new Date("0000-01-01T00:00:00.000Z").getTime();
const MAX_DATE = new Date("9999-12-31T23:59:59.999Z").getTime();

export async function auditBookingDates(
  bookings = mongoose.connection.collection("bookings"),
  { includeDuplicates = true } = {},
) {
  const dateStages = [
    {
      $project: {
        vendorId: 1,
        status: 1,
        eventDate: 1,
        eventDateOnly: 1,
        eventDateType: { $type: "$eventDate" },
        eventDateMillis: {
          $cond: [
            { $eq: [{ $type: "$eventDate" }, "date"] },
            { $convert: { input: "$eventDate", to: "long", onError: null, onNull: null } },
            null,
          ],
        },
        parsedDateKey: {
          $cond: [
            { $eq: [{ $type: "$eventDateOnly" }, "string"] },
            { $cond: [
              { $regexMatch: { input: "$eventDateOnly", regex: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" } },
              {
                $dateFromString: {
                  dateString: "$eventDateOnly",
                  format: "%Y-%m-%d",
                  timezone: "UTC",
                  onError: null,
                  onNull: null,
                },
              },
              null,
            ] },
            null,
          ],
        },
      },
    },
    {
      $set: {
        validEventDate: {
          $and: [
            { $eq: ["$eventDateType", "date"] },
            { $gte: ["$eventDateMillis", MIN_DATE] },
            { $lte: ["$eventDateMillis", MAX_DATE] },
          ],
        },
        missingDateKey: { $in: [{ $ifNull: ["$eventDateOnly", ""] }, [""]] },
        normalizedDateKey: {
          $cond: [
            { $ne: ["$parsedDateKey", null] },
            { $dateToString: { date: "$parsedDateKey", format: "%Y-%m-%d", timezone: "UTC" } },
            null,
          ],
        },
      },
    },
    {
      $set: {
        canonicalDate: {
          $cond: [
            "$validEventDate",
            { $dateToString: { date: "$eventDate", format: "%Y-%m-%d", timezone: "UTC" } },
            null,
          ],
        },
        invalidDateKey: {
          $and: [
            { $not: ["$missingDateKey"] },
            { $ne: ["$eventDateOnly", "$normalizedDateKey"] },
          ],
        },
      },
    },
    {
      $set: {
        mismatchedDateKey: {
          $and: [
            "$validEventDate",
            { $not: ["$missingDateKey"] },
            { $not: ["$invalidDateKey"] },
            { $ne: ["$eventDateOnly", "$canonicalDate"] },
          ],
        },
      },
    },
  ];
  const [result] = await bookings.aggregate([...dateStages, {
      $facet: {
        counts: [{
          $group: {
            _id: null,
            bookingsMissingDateKeys: { $sum: { $cond: ["$missingDateKey", 1, 0] } },
            bookingsInvalidDates: { $sum: { $cond: ["$validEventDate", 0, 1] } },
            bookingsInvalidDateKeys: { $sum: { $cond: ["$invalidDateKey", 1, 0] } },
            bookingsMismatchedDateKeys: { $sum: { $cond: ["$mismatchedDateKey", 1, 0] } },
          },
        }],
        bookingDateIssues: [
          { $match: { $or: [
            { missingDateKey: true }, { validEventDate: false },
            { invalidDateKey: true }, { mismatchedDateKey: true },
          ] } },
          { $limit: 20 },
          { $project: {
            _id: 0,
            bookingId: "$_id",
            missingDateKey: 1,
            invalidEventDate: { $not: ["$validEventDate"] },
            invalidDateKey: 1,
            mismatchedDateKey: 1,
          } },
        ],
      },
    }], { maxTimeMS: 30000 }).toArray();
  let duplicates;
  if (includeDuplicates) {
    // Group outside the facet so MongoDB can spill to disk. Both report arrays
    // are bounded even when a large legacy database has many collisions.
    [duplicates] = await bookings.aggregate([
      { $match: { status: { $in: ["accepted", "completed"] } } },
      ...dateStages,
      { $match: { validEventDate: true } },
      { $group: {
        _id: { vendor: "$vendorId", date: "$canonicalDate" },
        count: { $sum: 1 }, bookingIds: { $firstN: { input: "$_id", n: 20 } },
      } },
      { $match: { count: { $gt: 1 } } },
      { $facet: { counts: [{ $count: "value" }], samples: [{ $limit: 20 }] } },
    ], { allowDiskUse: true, maxTimeMS: 30000 }).toArray();
  }
  const { _id, ...counts } = result.counts[0] || {
    bookingsMissingDateKeys: 0,
    bookingsInvalidDates: 0,
    bookingsInvalidDateKeys: 0,
    bookingsMismatchedDateKeys: 0,
  };
  return {
    ...counts,
    bookingDateIssues: result.bookingDateIssues.map((issue) => ({ ...issue, bookingId: safeDocumentId(issue.bookingId) })),
    duplicateReservationGroups: duplicates?.counts[0]?.value || 0,
    duplicateReservations: (duplicates?.samples || []).map((group) => ({
      _id: { vendor: safeDocumentId(group._id.vendor), date: group._id.date },
      count: group.count, bookingIds: group.bookingIds.map(safeDocumentId).filter(Boolean),
    })),
  };
}

export async function assertCanonicalBookingDates(bookings) {
  // Startup only needs date integrity. The immediately following unique-index
  // build arbitrates duplicates without grouping all healthy history in a facet.
  const report = await auditBookingDates(bookings, { includeDuplicates: false });
  if (
    report.bookingsMissingDateKeys || report.bookingsInvalidDates ||
    report.bookingsInvalidDateKeys || report.bookingsMismatchedDateKeys
  ) {
    const error = new Error(
      "Booking date migration is required before serving traffic. " +
      "Run npm run data:audit and follow docs/MVP_MIGRATION.md; " +
      "repair invalid dates/date keys and resolve conflicting reservations before restart.",
    );
    error.code = "BOOKING_DATES_UNSAFE";
    throw error;
  }
  return report;
}
