import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { databaseConnectionOptions } from "../src/config/database.js";
import { inspectOutbox } from "../src/utils/outboxDiagnostics.js";

let mongo;
let connection;
const now = new Date("2028-04-01T12:00:00Z");

before(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri("outbox-diagnostics"), databaseConnectionOptions()).asPromise();
});
beforeEach(async () => { await connection.db.dropDatabase(); });
after(async () => { await connection.close(); await mongo.stop(); });

test("outbox diagnostics report empty state without creating the collection or claiming a job", async () => {
  const before = await connection.db.listCollections().toArray();
  const report = await inspectOutbox(connection.db, { now });
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.counts, { pending: 0, processing: 0, sent: 0, failed: 0, unknown: 0, ready: 0, expiredLeases: 0, terminalFailures: 0 });
  assert.equal(report.oldestReadyAgeMs, null);
  assert.deepEqual(await connection.db.listCollections().toArray(), before);
});

test("outbox diagnostics count backlog, expired leases and terminal failures without PII or provider errors", async () => {
  const outbox = connection.db.collection("notificationoutboxes");
  const older = new Date(now.getTime() - 60000);
  const future = new Date(now.getTime() + 60000);
  await outbox.insertMany([
    { status: "pending", attempts: 0, nextAttemptAt: older, createdAt: older },
    { status: "pending", attempts: 0, nextAttemptAt: future, createdAt: older },
    { status: "failed", attempts: 1, nextAttemptAt: older, createdAt: older },
    { status: "failed", attempts: 5, nextAttemptAt: null, createdAt: older },
    { status: "processing", attempts: 1, leaseExpiresAt: older, createdAt: older },
    { status: "processing", attempts: 1, leaseExpiresAt: future, createdAt: older },
    { status: "sent", attempts: 1, createdAt: older },
    { status: { private: "PRIVATE_STATUS" }, createdAt: older },
  ].map((record) => ({
    bookingId: new mongoose.Types.ObjectId(), eventType: "booking_accepted",
    recipientEmail: "PRIVATE_RECIPIENT@example.com", payload: { eventLocation: "PRIVATE_LOCATION" },
    lastError: "PRIVATE_SMTP_PASSWORD", ...record,
  })));
  const before = await outbox.find().sort({ _id: 1 }).toArray();
  const report = await inspectOutbox(connection.db, { now });
  assert.deepEqual(report.counts, { pending: 2, processing: 2, sent: 1, failed: 2, unknown: 1, ready: 2, expiredLeases: 1, terminalFailures: 1 });
  assert.equal(report.oldestReadyAgeMs, 60000);
  assert.equal(report.samples.ready.length, 2);
  for (const secret of ["PRIVATE_RECIPIENT", "PRIVATE_LOCATION", "PRIVATE_SMTP_PASSWORD", "PRIVATE_STATUS", "recipientEmail", "payload", "lastError"])
    assert.equal(JSON.stringify(report).includes(secret), false);
  assert.deepEqual(await outbox.find().sort({ _id: 1 }).toArray(), before);
});

test("diagnostic CLI is read-only, limits samples and sanitizes nested identifiers", async () => {
  const outbox = connection.db.collection("notificationoutboxes");
  await outbox.insertMany(Array.from({ length: 25 }, (_, index) => ({
    _id: index === 0 ? { private: "PRIVATE_ID" } : new mongoose.Types.ObjectId(),
    bookingId: { private: "PRIVATE_BOOKING" }, eventType: { private: "PRIVATE_EVENT" },
    recipientEmail: "PRIVATE_EMAIL", status: "failed", attempts: 5,
    nextAttemptAt: null, lastError: "PRIVATE_ERROR", createdAt: new Date(),
  })));
  const before = await outbox.find().sort({ _id: 1 }).toArray();
  const indexes = await outbox.indexes();
  const result = spawnSync(process.execPath, ["scripts/outboxDiagnostics.js"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 15000,
    env: { ...process.env, MONGODB_URI: mongo.getUri("outbox-diagnostics") },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.terminalFailures, 25);
  assert.equal(report.samples.terminalFailures.length, 20);
  assert.doesNotMatch(result.stdout, /PRIVATE_|recipientEmail|lastError/);
  assert.deepEqual(await outbox.find().sort({ _id: 1 }).toArray(), before);
  assert.deepEqual(await outbox.indexes(), indexes);
});
