import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Booking from "../src/models/Booking.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Availability from "../src/models/Availability.js";
import RefreshToken from "../src/models/RefreshToken.js";
import EmailOtp from "../src/models/EmailOtp.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import VendorModerationAudit from "../src/models/VendorModerationAudit.js";
import { databaseConnectionOptions } from "../src/config/database.js";
import { runDatabasePreflight } from "../src/utils/databasePreflight.js";
import { inspectOutbox } from "../src/utils/outboxDiagnostics.js";

const models = [Booking, User, Vendor, Availability, RefreshToken, EmailOtp, NotificationOutbox, VendorModerationAudit];
const collectionNames = models.map((model) => model.collection.name).sort();
const { BSON, ObjectId, Binary, Decimal128, Long, Double, Int32 } = mongoose.mongo;
const bsonOptions = { promoteValues: false, promoteLongs: false };
const localName = /^planzo_rehearsal_(source|restored)_[a-f0-9]{32}$/;
const fail = (code) => Object.assign(new Error("Isolated synthetic restore rehearsal failed."), { code });
const elapsed = (start) => Math.round((performance.now() - start) * 100) / 100;

// This tool deliberately accepts no URI, archive path or deployment environment.
// Both databases are created inside the tool's own disposable loopback server.
function requireRehearsalDatabase(db) {
  if (!localName.test(db.databaseName)) throw fail("REHEARSAL_NAMESPACE_REQUIRED");
}

export async function captureBsonSnapshot(db) {
  requireRehearsalDatabase(db);
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name).sort();
  assert.deepEqual(names, collectionNames);
  const collections = [];
  for (const name of names) {
    const documents = await db.collection(name).find({}, bsonOptions).sort({ _id: 1 }).toArray();
    const indexes = (await db.collection(name).listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name));
    collections.push({ name, documents: documents.map((document) => BSON.serialize(document)), indexes });
  }
  return { format: "planzo-synthetic-bson-v1", collections };
}

export async function restoreBsonSnapshot(db, snapshot) {
  requireRehearsalDatabase(db);
  // Refuse existing namespaces rather than deleting or overwriting any records.
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length)
    throw fail("REHEARSAL_TARGET_NOT_EMPTY");
  if (snapshot?.format !== "planzo-synthetic-bson-v1" ||
      JSON.stringify(snapshot.collections?.map(({ name }) => name).sort()) !== JSON.stringify(collectionNames))
    throw fail("REHEARSAL_ARCHIVE_INVALID");
  for (const { name, documents, indexes } of snapshot.collections) {
    await db.createCollection(name);
    if (documents.length)
      await db.collection(name).insertMany(documents.map((buffer) => BSON.deserialize(buffer, bsonOptions)));
    const secondary = indexes.filter((index) => index.name !== "_id_").map(({ v: _version, ns: _namespace, ...index }) => index);
    if (secondary.length) await db.collection(name).createIndexes(secondary);
  }
}

async function seedSyntheticData(db, now) {
  const admin = new ObjectId();
  const vendorUser = new ObjectId();
  const customer = new ObjectId();
  const vendor = new ObjectId();
  const timestamps = { createdAt: now, updatedAt: now };
  const users = [[admin, "admin"], [vendorUser, "vendor"], [customer, "customer"]].map(([_id, role]) => ({
    _id, role, name: `Synthetic ${role}`, email: `synthetic-${role}@example.invalid`,
    phone: "0000000000", password: "synthetic-unusable-password-hash", accountStatus: "active",
    authVersion: 0, bookingGuardRevision: 0, ...timestamps,
  }));
  // The archive must preserve numeric BSON types, binary, dates and references.
  users[0].rehearsalBsonProof = {
    binary: new Binary(Buffer.from("synthetic-bson-proof")), decimal: Decimal128.fromString("12.345"),
    long: Long.fromString("9007199254740993"), double: new Double(7), integer: new Int32(7),
  };
  await db.collection("users").insertMany(users);
  await db.collection("vendors").insertOne({
    _id: vendor, userId: vendorUser, businessName: "Synthetic restoration vendor", serviceCategory: "Decoration",
    description: "Synthetic fixture; no real business or recipient data.", pricing: 100, location: "Synthetic City",
    city: "Synthetic City", verificationStatus: "approved", verified: true, suspended: false,
    profileRevision: 2, bookingRevision: 1, servicesOffered: ["Synthetic service"], serviceAreas: [],
    portfolioImages: [], contactDetails: {}, ...timestamps,
  });
  const statuses = ["pending", "accepted", "rejected", "cancelled", "completed"];
  const bookings = statuses.map((status, index) => {
    const eventDate = new Date(now);
    eventDate.setUTCDate(eventDate.getUTCDate() + 30 + index);
    eventDate.setUTCHours(0, 0, 0, 0);
    return {
      _id: new ObjectId(), customerId: customer, vendorId: vendor, eventType: "Synthetic event",
      eventLocation: "Synthetic venue", eventDate, eventDateOnly: eventDate.toISOString().slice(0, 10),
      status, description: "Synthetic booking", notes: "", ...timestamps,
    };
  });
  await db.collection("bookings").insertMany(bookings);
  await db.collection("availabilities").insertOne({
    _id: new ObjectId(), vendorId: vendor, availableDates: [], unavailableDates: [], ...timestamps,
  });
  const expiresAt = new Date(now.getTime() + 86400000);
  await db.collection("refreshtokens").insertOne({
    _id: new ObjectId(), userId: customer, tokenHash: "synthetic-not-a-valid-refresh-token", expiresAt, authVersion: 0, ...timestamps,
  });
  await db.collection("emailotps").insertOne({
    _id: new ObjectId(), email: "synthetic-customer@example.invalid", codeHash: "synthetic-not-a-valid-otp",
    expiresAt, requestedAt: now, attempts: 0, consumedAt: null, ...timestamps,
  });
  const rows = [
    [0, "booking_requested", vendorUser, "vendor", "pending"],
    [1, "booking_accepted", customer, "customer", "sent"],
    [2, "booking_rejected", customer, "customer", "failed"],
    [3, "booking_cancelled", customer, "customer", "processing"],
    [3, "booking_cancelled", vendorUser, "vendor", "failed"],
    [4, "booking_completed", customer, "customer", "sent"],
  ];
  const eventIds = bookings.map(() => randomUUID());
  await db.collection("notificationoutboxes").insertMany(rows.map(([index, eventType, recipientUserId, recipientRole, status]) => ({
    _id: new ObjectId(), bookingId: bookings[index]._id, eventId: eventIds[index], eventType,
    recipientUserId, recipientEmail: `synthetic-${recipientRole}@example.invalid`,
    payload: {
      customerName: "Synthetic customer", vendorName: "Synthetic restoration vendor", service: "Decoration",
      eventType: "Synthetic event", eventDateOnly: bookings[index].eventDateOnly,
      eventLocation: "Synthetic venue", recipientRole,
    }, status, attempts: status === "pending" ? 0 : status === "failed" && recipientRole === "vendor" ? 5 : 1,
    nextAttemptAt: status === "sent" || recipientRole === "vendor" && status === "failed" ? null : now,
    sentAt: status === "sent" ? now : null,
    lastError: status === "failed" ? "booking_email_delivery_failed" : "",
    leaseToken: status === "processing" ? randomUUID() : null,
    leaseExpiresAt: status === "processing" ? new Date(now.getTime() - 1000) : null, ...timestamps,
  })));
  await db.collection("vendormoderationaudits").insertMany([
    { _id: new ObjectId(), actorId: admin, targetUserId: vendorUser, vendorId: vendor, action: "reject", fromState: "pending", toState: "rejected", reason: "Synthetic review", profileRevision: 1, createdAt: now },
    { _id: new ObjectId(), actorId: admin, targetUserId: vendorUser, vendorId: vendor, action: "approve", fromState: "pending", toState: "approved", reason: "", profileRevision: 2, createdAt: now },
  ]);
  for (const model of models)
    for (const [key, options] of model.schema.indexes())
      await db.collection(model.collection.name).createIndex(key, options);
}

const summarize = (snapshot) => Object.fromEntries(snapshot.collections.map(({ name, documents }) => [name, documents.length]));
const sameSnapshot = (actual, expected) => {
  assert.equal(actual.format, expected.format);
  assert.deepEqual(actual.collections, expected.collections);
};

async function duplicateRejected(collection, document) {
  const before = await collection.countDocuments();
  let rejected = false;
  try {
    await collection.insertOne({ ...document, _id: new ObjectId() });
  } catch (error) {
    if (error.code !== 11000) throw error;
    rejected = true;
  }
  assert.equal(rejected, true, "Restored unique index must reject a conflicting document.");
  assert.equal(await collection.countDocuments(), before);
  return true;
}

export async function runSyntheticRestoreRehearsal() {
  let mongo;
  let connection;
  let stage = "local_server_start";
  let restoreStarted;
  const started = performance.now();
  try {
    const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    mongo = await MongoMemoryReplSet.create({
      binary: { downloadDir: process.env.MONGOMS_DOWNLOAD_DIR || path.join(serverRoot, ".cache", "mongodb") },
      instanceOpts: [{ ip: "127.0.0.1" }], replSet: { count: 1 },
    });
    const suffix = randomUUID().replaceAll("-", "");
    connection = await mongoose.createConnection(mongo.getUri(`planzo_rehearsal_source_${suffix}`), databaseConnectionOptions({})).asPromise();
    const source = connection.db;
    const restored = connection.getClient().db(`planzo_rehearsal_restored_${suffix}`);
    const now = new Date();
    stage = "synthetic_seed";
    await seedSyntheticData(source, now);
    stage = "bson_backup";
    const backupStarted = performance.now();
    const backup = await captureBsonSnapshot(source);
    const backupDurationMs = elapsed(backupStarted);
    stage = "source_preflight";
    const sourcePreflight = await runDatabasePreflight(source);
    assert.equal(sourcePreflight.status, "PASS");
    sameSnapshot(await captureBsonSnapshot(source), backup);
    stage = "bson_restore";
    restoreStarted = performance.now();
    await restoreBsonSnapshot(restored, backup);
    const restoreDurationMs = elapsed(restoreStarted);
    stage = "restored_checks";
    const restoredSnapshot = await captureBsonSnapshot(restored);
    sameSnapshot(restoredSnapshot, backup);
    const restoredPreflight = await runDatabasePreflight(restored);
    assert.equal(restoredPreflight.status, "PASS");
    const diagnostics = await inspectOutbox(restored, { now });
    // Preflight/diagnostics must leave both the source and restored data/indexes unchanged.
    sameSnapshot(await captureBsonSnapshot(source), backup);
    sameSnapshot(await captureBsonSnapshot(restored), restoredSnapshot);
    stage = "reservation_constraint";
    const accepted = await restored.collection("bookings").findOne({ status: "accepted" });
    const reservationConflictRejected = await duplicateRejected(restored.collection("bookings"), { ...accepted, status: "completed" });
    stage = "outbox_identity_constraint";
    const job = await restored.collection("notificationoutboxes").findOne({});
    const outboxDuplicateRejected = await duplicateRejected(restored.collection("notificationoutboxes"), job);
    sameSnapshot(await captureBsonSnapshot(restored), restoredSnapshot);
    return {
      status: "PASS", scope: "isolated_local_synthetic", method: "quiescent_bson_logical_copy",
      executedAt: now.toISOString(), hostedVerified: false, productionVerified: false,
      providerSnapshotTested: false, mongoDatabaseToolsTested: false, emailsSent: 0,
      topology: restoredPreflight.topology, collectionCount: backup.collections.length,
      requiredIndexCount: restoredPreflight.indexes.length,
      restoredIndexCountIncludingId: restoredSnapshot.collections.reduce((count, collection) => count + collection.indexes.length, 0),
      sourceCounts: summarize(backup), restoredCounts: summarize(restoredSnapshot),
      documentCount: backup.collections.reduce((count, collection) => count + collection.documents.length, 0),
      bsonBytes: backup.collections.reduce((count, collection) => count + collection.documents.reduce((bytes, document) => bytes + document.length, 0), 0),
      backupDurationMs, restoreDurationMs, totalDurationMs: elapsed(started),
      verification: {
        sourcePreflight: sourcePreflight.status, restoredPreflight: restoredPreflight.status,
        bsonRoundTripAndIndexesEqual: true, readOnlyChecksPreservedSourceAndTarget: true,
        reservationConflictRejected, outboxDuplicateRejected, outboxCounts: diagnostics.counts,
      }, failures: [],
    };
  } catch {
    throw Object.assign(fail("SYNTHETIC_RESTORE_REHEARSAL_FAILED"), {
      stage, restoreDurationMs: restoreStarted === undefined ? null : elapsed(restoreStarted),
    });
  } finally {
    await connection?.close().catch(() => {});
    await mongo?.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Object.assign(fail("REHEARSAL_ARGUMENTS_NOT_ALLOWED"), { stage: "arguments" });
    console.log(JSON.stringify(await runSyntheticRestoreRehearsal(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: "FAILED", scope: "isolated_local_synthetic", category: "synthetic_restore_rehearsal_failed",
      stage: error.stage || "local_server_start", restoreDurationMs: error.restoreDurationMs ?? null,
    }));
    process.exitCode = 1;
  }
}
