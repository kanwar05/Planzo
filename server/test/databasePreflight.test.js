import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";
import Booking from "../src/models/Booking.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Availability from "../src/models/Availability.js";
import RefreshToken from "../src/models/RefreshToken.js";
import EmailOtp from "../src/models/EmailOtp.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import VendorModerationAudit from "../src/models/VendorModerationAudit.js";
import { databaseConnectionOptions, inspectDatabaseTopology } from "../src/config/database.js";
import { assertRequiredIndexes, inspectRequiredIndexes, runDatabasePreflight } from "../src/utils/databasePreflight.js";
import { auditBookingDates } from "../src/utils/bookingDataAudit.js";

const models = [Booking, User, Vendor, Availability, RefreshToken, EmailOtp, NotificationOutbox, VendorModerationAudit];
let mongo;
let connection;
const open = () => mongoose.createConnection(mongo.getUri("preflight-test"), databaseConnectionOptions()).asPromise();

async function installIndexes() {
  for (const model of models)
    for (const [key, options] of model.schema.indexes())
      await connection.db.collection(model.collection.name).createIndex(key, options);
}

async function snapshot(db = connection.db) {
  const result = [];
  for (const { name } of (await db.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
    result.push({ name, indexes: await db.collection(name).indexes(), records: await db.collection(name).find().sort({ _id: 1 }).toArray() });
  }
  return result;
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  connection = await open();
});
beforeEach(async () => { await connection.db.dropDatabase(); });
after(async () => {
  await connection?.close();
  await mongo?.stop();
});

test("read-only preflight on a fresh database reports missing indexes without creating collections", async () => {
  const before = await snapshot();
  const result = spawnSync(process.execPath, ["scripts/preflightDatabase.js"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 20000,
    env: { ...process.env, MONGODB_URI: mongo.getUri("preflight-test") },
  });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.readOnly, true);
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.topology.transactionsSupported, true);
  assert.equal(report.topology.mongodb6OrNewer, true);
  assert.ok(report.indexes.some((check) => check.index === "one_confirmed_booking_per_vendor_date" && check.status === "MISSING"));
  assert.deepEqual(await snapshot(), before);
});

test("preflight verifies every declared index and compatible legacy approval without exposing stored values", async () => {
  await installIndexes();
  const userId = new mongoose.Types.ObjectId();
  const vendorId = new mongoose.Types.ObjectId();
  await connection.db.collection("users").insertOne({
    _id: userId, name: "Private name", email: "private-recipient@example.com", phone: "9999999999", password: "PRIVATE_HASH", role: "vendor",
  });
  await connection.db.collection("vendors").insertOne({
    _id: vendorId, userId, businessName: "Private business", serviceCategory: "Decoration",
    description: "PRIVATE_DESCRIPTION", pricing: 100, location: "PRIVATE_LOCATION", verified: true,
  });
  await connection.db.collection("bookings").insertOne({
    customerId: userId, vendorId, eventType: "Wedding", eventLocation: "PRIVATE_EVENT_LOCATION",
    eventDate: new Date("2028-04-01T08:00:00Z"), eventDateOnly: "2028-04-01", status: "accepted",
  });
  const before = await snapshot();
  const report = await runDatabasePreflight(connection.db);
  assert.equal(report.status, "PASS");
  assert.equal(report.data.legacyVendorApprovals, 1);
  assert.ok(report.indexes.length > 10);
  assert.ok(report.indexes.every((check) => check.status === "PASS"));
  await assert.doesNotReject(assertRequiredIndexes(connection.db));
  for (const secret of ["private-recipient@example.com", "PRIVATE_HASH", "PRIVATE_DESCRIPTION", "PRIVATE_EVENT_LOCATION", "9999999999"])
    assert.equal(JSON.stringify(report).includes(secret), false);
  assert.deepEqual(await snapshot(), before);
});

test("incompatible reservation and outbox indexes and missing moderation indexes fail closed without changes", async () => {
  await installIndexes();
  const bookings = connection.db.collection("bookings");
  await bookings.dropIndex("one_confirmed_booking_per_vendor_date");
  await bookings.createIndex({ vendorId: 1, eventDateOnly: 1 }, { name: "one_confirmed_booking_per_vendor_date" });
  const outbox = connection.db.collection("notificationoutboxes");
  await outbox.dropIndex("one_booking_email_per_event_recipient");
  await outbox.createIndex({ eventId: 1, recipientUserId: 1 }, { name: "one_booking_email_per_event_recipient", unique: true, sparse: true });
  await connection.db.collection("vendormoderationaudits").dropIndex("vendorId_1_createdAt_-1__id_-1");
  const before = await snapshot();
  const checks = await inspectRequiredIndexes(connection.db);
  assert.equal(checks.find((check) => check.index === "one_confirmed_booking_per_vendor_date").status, "INCOMPATIBLE");
  assert.equal(checks.find((check) => check.index === "one_booking_email_per_event_recipient").status, "INCOMPATIBLE");
  assert.equal(checks.find((check) => check.collection === "vendormoderationaudits").status, "MISSING");
  await assert.rejects(assertRequiredIndexes(connection.db), (error) => error.code === "PREFLIGHT_INDEX_INVALID");
  assert.deepEqual(await snapshot(), before);
});

test("preflight reports actual-day collisions, unsafe dates, missing required fields and unexpected statuses with bounded IDs only", async () => {
  await installIndexes();
  const vendorId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  await connection.db.collection("bookings").insertMany([
    { vendorId, customerId, eventType: "Event", eventLocation: "PRIVATE_EVENT", eventDate: new Date("2028-04-01"), eventDateOnly: "2028-04-01", status: "accepted" },
    { vendorId, customerId, eventType: "Event", eventLocation: "PRIVATE_EVENT", eventDate: new Date("2028-04-01"), eventDateOnly: "2028-04-02", status: "completed" },
    { vendorId, eventDate: "invalid secret date", eventDateOnly: "bad secret key", status: "unexpected-private-status" },
  ]);
  await connection.db.collection("vendors").insertOne({
    userId: new mongoose.Types.ObjectId(), verificationStatus: { privateEmail: "private@example.com" },
  });
  await connection.db.collection("notificationoutboxes").insertOne({
    bookingId: new mongoose.Types.ObjectId(), eventId: "legacy-event", eventType: "booking_requested", status: "pending", payload: {},
  });
  const before = await snapshot();
  const report = await runDatabasePreflight(connection.db);
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.data.dates.duplicateReservationGroups, 1);
  assert.equal(report.data.dates.bookingsMismatchedDateKeys, 1);
  assert.equal(report.data.dates.bookingsInvalidDates, 1);
  assert.equal(report.data.collections.find((row) => row.collection === "bookings").requiredFields.count, 1);
  assert.equal(report.data.statuses.find((row) => row.collection === "vendors").count, 1);
  assert.equal(report.data.statuses.find((row) => row.field === "payload.recipientRole").count, 1);
  for (const secret of ["PRIVATE_EVENT", "invalid secret date", "bad secret key", "unexpected-private-status", "private@example.com"])
    assert.equal(JSON.stringify(report).includes(secret), false);
  assert.deepEqual(await snapshot(), before);
});

test("date diagnostics bound duplicate groups and booking IDs and sanitize malformed legacy IDs", async () => {
  const bookings = connection.db.collection("bookings");
  const records = [];
  for (let group = 0; group < 25; group += 1) {
    const vendorId = new mongoose.Types.ObjectId();
    for (let item = 0; item < (group === 0 ? 45 : 2); item += 1)
      records.push({ vendorId, eventDate: new Date("2028-04-01"), eventDateOnly: "2028-04-01", status: "accepted" });
  }
  records[0]._id = { privateEmail: "PRIVATE_ID_SECRET" };
  records[0].eventDateOnly = "bad key";
  await bookings.insertMany(records);
  const report = await auditBookingDates(bookings);
  assert.equal(report.duplicateReservationGroups, 25);
  assert.equal(report.duplicateReservations.length, 20);
  assert.ok(report.duplicateReservations.every((row) => row.bookingIds.length <= 20));
  assert.equal(JSON.stringify(report).includes("PRIVATE_ID_SECRET"), false);
});

test("database topology and version checks do not report deployment identifiers", async () => {
  const standalone = await MongoMemoryServer.create();
  const standaloneConnection = await mongoose.createConnection(standalone.getUri(), databaseConnectionOptions()).asPromise();
  try {
    assert.deepEqual(await inspectDatabaseTopology(standaloneConnection.db), {
      topology: "standalone", transactionsSupported: false, mongodb6OrNewer: true,
    });
    const old = await inspectDatabaseTopology({ admin: () => ({ command: async () => ({ setName: "PRIVATE_SET", maxWireVersion: 16 }) }) });
    assert.equal(old.mongodb6OrNewer, false);
    assert.equal(old.transactionsSupported, true);
    assert.equal(JSON.stringify(old).includes("PRIVATE_SET"), false);
    const unsupported = await runDatabasePreflight({ admin: () => ({ command: async () => ({ setName: "PRIVATE_SET", maxWireVersion: 16 }) }) });
    assert.equal(unsupported.status, "BLOCKED");
    assert.equal(unsupported.data, null, "unsupported servers must not execute newer audit operators");
  } finally {
    await standaloneConnection.close();
    await standalone.stop();
  }
});

test("a closed database connection fails safely and a fresh connection resumes index preflight", async () => {
  await installIndexes();
  const closedDb = connection.db;
  await connection.close();
  try {
    await assert.rejects(runDatabasePreflight(closedDb), (error) => error.code === "PREFLIGHT_READ_FAILED" && !error.message.includes("mongodb://"));
  } finally {
    connection = await open();
  }
  assert.equal((await runDatabasePreflight(connection.db)).status, "PASS");
});

test("database connection timeouts are bounded and failed preflight CLI output does not print credentials", () => {
  const defaults = databaseConnectionOptions({});
  assert.equal(defaults.autoCreate, false);
  assert.equal(defaults.autoIndex, false);
  assert.equal(defaults.serverSelectionTimeoutMS, 10000);
  assert.equal(defaults.socketTimeoutMS, 20000);
  assert.equal(defaults.timeoutMS, undefined, "Do not enable driver CSOT.");
  assert.throws(() => databaseConnectionOptions({ MONGO_SOCKET_TIMEOUT_MS: "999999" }), /timeout configuration/);
  const result = spawnSync(process.execPath, ["scripts/preflightDatabase.js"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000,
    env: { ...process.env, MONGODB_URI: ["mongodb://", "fake-user", ":", "PRIVATE_CONNECTION_SECRET", "@", "127.0.0.1:1/private-database"].join(""),
      MONGO_SERVER_SELECTION_TIMEOUT_MS: "1000", MONGO_CONNECT_TIMEOUT_MS: "1000" },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /database_preflight_failed/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_CONNECTION_SECRET|fake-user|private-database|127\.0\.0\.1/);
});
