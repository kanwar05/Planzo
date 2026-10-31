import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { auditBookingDates, assertCanonicalBookingDates } from "../src/utils/bookingDataAudit.js";

test("legacy data audit detects date collisions without modifying application records", { timeout: 30000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    const vendorId = new mongoose.Types.ObjectId();
    const bookings = mongoose.connection.collection("bookings");
    await bookings.insertMany([
      { vendorId, eventDate: new Date("2026-10-25T00:00:00Z"), eventDateOnly: null, status: "accepted", paymentStatus: "paid" },
      { vendorId, eventDate: new Date("2026-10-25T05:00:00Z"), eventDateOnly: "", status: "completed", totalPaidAmount: 12345 },
    ]);
    await mongoose.connection.collection("vendors").insertOne({ _id: vendorId, verified: true });
    await mongoose.connection.collection("availabilities").insertOne({ vendorId, vacations: [{ startDate: "2026-10-26", endDate: "2026-10-28" }] });
    const before = await bookings.find().sort({ _id: 1 }).toArray();
    const result = spawnSync(process.execPath, ["scripts/auditData.js"], {
      cwd: new URL("../", import.meta.url), encoding: "utf8",
      env: { ...process.env, MONGODB_URI: mongo.getUri() }, timeout: 15000,
    });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.readOnly, true);
    assert.equal(report.bookingsMissingDateKeys, 2);
    assert.equal(report.bookingsInvalidDates, 0);
    assert.equal(report.bookingsInvalidDateKeys, 0);
    assert.equal(report.bookingsMismatchedDateKeys, 0);
    assert.equal(report.duplicateReservations.length, 1);
    assert.equal(report.duplicateReservations[0].count, 2);
    // The lightweight startup check leaves uniqueness to index creation.
    const startupDates = await auditBookingDates(bookings, { includeDuplicates: false });
    assert.deepEqual(startupDates.duplicateReservations, []);
    assert.equal(startupDates.bookingsMissingDateKeys, report.bookingsMissingDateKeys);
    assert.equal(report.vendorsUsingLegacyApproval, 1);
    assert.equal(report.availabilityRecordsWithRetiredRules, 1);
    assert.deepEqual(await bookings.find().sort({ _id: 1 }).toArray(), before);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("date audit handles corrupt BSON dates and keys and groups conflicts by the actual UTC day", { timeout: 30000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    const bookings = mongoose.connection.collection("bookings");
    const vendorId = new mongoose.Types.ObjectId();
    const eventDate = new Date("2026-10-25T00:00:00Z");
    await bookings.insertOne({ vendorId, eventDate, eventDateOnly: "2026-10-25", status: "accepted" });
    assert.equal((await assertCanonicalBookingDates(bookings)).bookingsInvalidDates, 0);

    const corruptDates = [
      { eventDate: "2026-10-25" },
      { eventDate: 0 },
      { eventDate: null },
      {},
      { eventDate: new Date("+010000-01-01T00:00:00Z") },
    ];
    await bookings.insertMany([
      ...corruptDates.map((fields) => ({ vendorId, eventDateOnly: "2026-10-25", status: "pending", ...fields })),
      { vendorId, eventDate, status: "pending" },
      { vendorId, eventDate, eventDateOnly: null, status: "pending" },
      { vendorId, eventDate, eventDateOnly: "", status: "pending" },
      ...["2026-02-30", "2026-1-01", { unexpected: "value" }].map((eventDateOnly) => (
        { vendorId, eventDate, eventDateOnly, status: "pending" }
      )),
      // Different persisted keys must not hide an actual reservation collision.
      { vendorId, eventDate: new Date("2026-10-25T23:59:59Z"), eventDateOnly: "2026-10-26", status: "completed", notes: "private customer details" },
    ]);
    const outsideJsRange = await bookings.insertOne({ vendorId, eventDate, eventDateOnly: "2026-10-25", status: "pending" });
    await bookings.updateOne({ _id: outsideJsRange.insertedId }, [{
      $set: { eventDate: { $convert: { input: mongoose.mongo.Long.fromString("9223372036854775807"), to: "date" } } },
    }]);
    const before = await bookings.find().sort({ _id: 1 }).toArray();
    const report = await auditBookingDates(bookings);
    assert.equal(report.bookingsMissingDateKeys, 3);
    assert.equal(report.bookingsInvalidDates, 6);
    assert.equal(report.bookingsInvalidDateKeys, 3);
    assert.equal(report.bookingsMismatchedDateKeys, 1);
    assert.equal(report.duplicateReservations.length, 1);
    assert.equal(report.duplicateReservations[0]._id.date, "2026-10-25");
    assert.equal(report.duplicateReservations[0].count, 2);
    assert.equal(report.bookingDateIssues.length, 13);
    assert.equal(JSON.stringify(report).includes("private customer details"), false);
    await assert.rejects(assertCanonicalBookingDates(bookings), /migration is required.*data:audit/);
    assert.deepEqual(await bookings.find().sort({ _id: 1 }).toArray(), before);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("startup date guard rejects each unsafe date category and limits issue samples", { timeout: 30000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    const bookings = mongoose.connection.collection("bookings");
    await assert.doesNotReject(assertCanonicalBookingDates(bookings));
    const cases = [
      { eventDate: new Date("2026-10-25") },
      { eventDate: "2026-10-25", eventDateOnly: "2026-10-25" },
      { eventDate: new Date("2026-10-25"), eventDateOnly: "bad date" },
      { eventDate: new Date("2026-10-25"), eventDateOnly: "2026-10-26" },
    ];
    for (const fields of cases) {
      const inserted = await bookings.insertOne({ status: "pending", ...fields });
      await assert.rejects(assertCanonicalBookingDates(bookings), /Booking date migration is required/);
      await bookings.deleteOne({ _id: inserted.insertedId });
    }
    await bookings.insertMany(Array.from({ length: 25 }, () => ({ eventDateOnly: "2026-10-25" })));
    const report = await auditBookingDates(bookings);
    assert.equal(report.bookingsInvalidDates, 25);
    assert.equal(report.bookingDateIssues.length, 20);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
