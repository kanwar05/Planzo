import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { databaseConnectionOptions } from "../src/config/database.js";
import { restoreBsonSnapshot } from "../scripts/rehearseStagingRestore.js";

let mongo;
let connection;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  connection = await mongoose.createConnection(mongo.getUri(), databaseConnectionOptions({})).asPromise();
});
after(async () => {
  await connection?.close();
  await mongo?.stop();
});

test("isolated synthetic BSON restore reports real measurements, preserves all eight collections and restores constraints", () => {
  const result = spawnSync(process.execPath, ["scripts/rehearseStagingRestore.js"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 90000,
    env: { ...process.env, MONGODB_URI: "PRIVATE_PRODUCTION_URI_MUST_NEVER_BE_READ" },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.equal(report.scope, "isolated_local_synthetic");
  assert.equal(report.method, "quiescent_bson_logical_copy");
  assert.equal(report.hostedVerified, false);
  assert.equal(report.productionVerified, false);
  assert.equal(report.providerSnapshotTested, false);
  assert.equal(report.mongoDatabaseToolsTested, false);
  assert.equal(report.emailsSent, 0);
  assert.equal(report.topology.transactionsSupported, true);
  assert.equal(report.topology.mongodb6OrNewer, true);
  assert.equal(report.collectionCount, 8);
  assert.equal(report.requiredIndexCount, 18);
  assert.equal(report.restoredIndexCountIncludingId, 26);
  assert.equal(report.documentCount, 20);
  assert.deepEqual(report.sourceCounts, report.restoredCounts);
  assert.equal(report.restoredCounts.bookings, 5);
  assert.equal(report.restoredCounts.notificationoutboxes, 6);
  assert.equal(report.restoredCounts.vendormoderationaudits, 2);
  assert.ok(report.bsonBytes > 0);
  for (const field of ["backupDurationMs", "restoreDurationMs", "totalDurationMs"])
    assert.ok(Number.isFinite(report[field]) && report[field] > 0, `${field} is measured`);
  assert.equal(report.verification.sourcePreflight, "PASS");
  assert.equal(report.verification.restoredPreflight, "PASS");
  assert.equal(report.verification.bsonRoundTripAndIndexesEqual, true);
  assert.equal(report.verification.readOnlyChecksPreservedSourceAndTarget, true);
  assert.equal(report.verification.reservationConflictRejected, true);
  assert.equal(report.verification.outboxDuplicateRejected, true);
  assert.deepEqual(report.verification.outboxCounts, {
    pending: 1, processing: 1, sent: 2, failed: 2, unknown: 0,
    ready: 2, expiredLeases: 1, terminalFailures: 1,
  });
  assert.deepEqual(report.failures, []);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_PRODUCTION_URI|synthetic-customer@|password|tokenHash|leaseToken|127\.0\.0\.1|mongodb:\/\//);
});

test("restore refuses existing or non-rehearsal databases without changing documents or indexes", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const target = connection.getClient().db(`planzo_rehearsal_restored_${suffix}`);
  await target.collection("sentinel").insertOne({ _id: new mongoose.Types.ObjectId(), value: "retain" });
  const records = await target.collection("sentinel").find().toArray();
  const indexes = await target.collection("sentinel").indexes();
  await assert.rejects(restoreBsonSnapshot(target, {}), (error) => error.code === "REHEARSAL_TARGET_NOT_EMPTY");
  assert.deepEqual(await target.collection("sentinel").find().toArray(), records);
  assert.deepEqual(await target.collection("sentinel").indexes(), indexes);
  assert.deepEqual((await target.listCollections().toArray()).map(({ name }) => name), ["sentinel"]);
  const unrelated = connection.getClient().db("not_a_rehearsal_target");
  await assert.rejects(restoreBsonSnapshot(unrelated, {}), (error) => error.code === "REHEARSAL_NAMESPACE_REQUIRED");
  assert.deepEqual(await unrelated.listCollections().toArray(), []);
});

test("restore rejects malformed archives and CLI refuses URI arguments before creating a server", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const target = connection.getClient().db(`planzo_rehearsal_restored_${suffix}`);
  await assert.rejects(restoreBsonSnapshot(target, { format: "unknown", collections: [] }), (error) => error.code === "REHEARSAL_ARCHIVE_INVALID");
  assert.deepEqual(await target.listCollections().toArray(), []);
  const result = spawnSync(process.execPath, ["scripts/rehearseStagingRestore.js", "--uri=PRIVATE_URI_ARGUMENT"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    status: "FAILED", scope: "isolated_local_synthetic", category: "synthetic_restore_rehearsal_failed",
    stage: "arguments", restoreDurationMs: null,
  });
  assert.doesNotMatch(result.stderr, /PRIVATE_URI_ARGUMENT/);
});
