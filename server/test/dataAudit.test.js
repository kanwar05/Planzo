import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

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
    assert.equal(report.duplicateReservations.length, 1);
    assert.equal(report.duplicateReservations[0].count, 2);
    assert.equal(report.vendorsUsingLegacyApproval, 1);
    assert.equal(report.availabilityRecordsWithRetiredRules, 1);
    assert.deepEqual(await bookings.find().sort({ _id: 1 }).toArray(), before);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
