import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Booking from "../src/models/Booking.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { setBookingEmailSenderForTests } from "../src/services/bookingEmailService.js";
import {
  BOOKING_EMAIL_POLICY,
  claimBookingEmail,
  deliverClaimedBookingEmail,
  dispatchBookingEmailBatch,
} from "../src/services/bookingEmailDispatcher.js";

let mongo;
const start = new Date("2028-04-01T00:00:00.000Z");
const logger = { warn() {} };
const accepted = (job) => ({ accepted: [job.recipientEmail], rejected: [] });

async function job(extra = {}) {
  return NotificationOutbox.create({
    bookingId: new mongoose.Types.ObjectId(), eventId: randomUUID(),
    eventType: "booking_accepted", recipientUserId: new mongoose.Types.ObjectId(),
    recipientEmail: "customer@example.com", nextAttemptAt: start,
    payload: {
      customerName: "Customer", vendorName: "Bright Events", service: "Decoration",
      eventType: "Wedding", eventDateOnly: "2028-04-10", eventLocation: "Delhi",
      recipientRole: "customer",
    },
    ...extra,
  });
}

before(async () => {
  process.env.NODE_ENV = "test";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([NotificationOutbox.init(), Booking.init()]);
});
beforeEach(async () => {
  await Promise.all([NotificationOutbox.deleteMany({}), Booking.deleteMany({})]);
  setBookingEmailSenderForTests(undefined);
});
after(async () => {
  setBookingEmailSenderForTests(undefined);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("SMTP failure preserves booking state, stores a sanitized failure and retries after backoff", async () => {
  const booking = await Booking.create({
    customerId: new mongoose.Types.ObjectId(), vendorId: new mongoose.Types.ObjectId(),
    eventType: "Wedding", eventDate: new Date("2028-04-10T00:00:00.000Z"),
    eventLocation: "Delhi", description: "Decorate the hall", status: "accepted",
  });
  const before = await Booking.findById(booking._id).lean();
  const queued = await job({ bookingId: booking._id });
  const logs = [];
  setBookingEmailSenderForTests(async () => {
    const failure = new Error("SMTP password=secret and private@example.com");
    failure.code = "ECONNRESET";
    throw failure;
  });
  assert.deepEqual(await dispatchBookingEmailBatch({
    now: start, logger: { warn: (...args) => logs.push(args) },
  }), { claimed: 1, sent: 0, failed: 1, stale: 0 });
  const failed = await NotificationOutbox.findById(queued._id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, "booking_email_delivery_failed:ECONNRESET");
  assert.equal(failed.nextAttemptAt.getTime(), start.getTime() + 30_000);
  assert.equal(await claimBookingEmail({ now: new Date(start.getTime() + 29_999) }), null);
  assert.deepEqual(await Booking.findById(booking._id).lean(), before);
  assert.doesNotMatch(JSON.stringify(logs), /secret|private@example|password=/);

  setBookingEmailSenderForTests(async (message) => ({ accepted: [message.to], rejected: [] }));
  const retryAt = new Date(start.getTime() + 30_000);
  assert.deepEqual(await dispatchBookingEmailBatch({ now: retryAt, logger }), {
    claimed: 1, sent: 1, failed: 0, stale: 0,
  });
  const sent = await NotificationOutbox.findById(queued._id);
  assert.equal(sent.status, "sent");
  assert.equal(sent.attempts, 2);
  assert.equal(sent.sentAt.getTime(), retryAt.getTime());
  assert.equal(sent.nextAttemptAt, null);
  assert.equal(sent.leaseToken, null);
  assert.equal(sent.lastError, "");
  assert.deepEqual(await Booking.findById(booking._id).lean(), before);
  assert.equal(await claimBookingEmail({ now: new Date("2030-01-01") }), null);
});

test("multiple workers atomically claim one pending job once", async () => {
  const queued = await job();
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimBookingEmail({ now: start })));
  const winners = claims.filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal(String(winners[0]._id), String(queued._id));
  assert.equal(winners[0].attempts, 1);
  assert.equal(winners[0].leaseExpiresAt.getTime(), start.getTime() + BOOKING_EMAIL_POLICY.leaseMs);
  assert.match(winners[0].leaseToken, /^[0-9a-f-]{36}$/);
});

test("an expired processing lease survives restart and fences the old worker acknowledgement", async () => {
  const queued = await job();
  const first = await claimBookingEmail({ now: start });
  let clock = start;
  let entered;
  let release;
  const sending = new Promise((resolve) => { entered = resolve; });
  const delivery = new Promise((resolve) => { release = resolve; });
  const staleDelivery = deliverClaimedBookingEmail(first, {
    now: () => clock, logger,
    sender: async () => { entered(); return delivery; },
  });
  await sending;
  clock = new Date(start.getTime() + BOOKING_EMAIL_POLICY.leaseMs + 1);
  const recovered = await claimBookingEmail({ now: clock });
  assert.equal(String(recovered._id), String(queued._id));
  assert.equal(recovered.attempts, 2);
  assert.notEqual(recovered.leaseToken, first.leaseToken);
  release(accepted(first));
  assert.deepEqual(await staleDelivery, { outcome: "stale" });
  assert.equal((await NotificationOutbox.findById(queued._id)).leaseToken, recovered.leaseToken);
  assert.deepEqual(await deliverClaimedBookingEmail(recovered, { now: clock, sender: accepted, logger }), { outcome: "sent" });
  assert.equal((await NotificationOutbox.findById(queued._id)).status, "sent");
});

test("stale or expired claims cannot initiate another delivery", async () => {
  await job();
  const claimed = await claimBookingEmail({ now: start });
  let calls = 0;
  const sender = async () => { calls += 1; return accepted(claimed); };
  const afterLease = new Date(start.getTime() + BOOKING_EMAIL_POLICY.leaseMs);
  const insufficientTime = new Date(afterLease.getTime() - BOOKING_EMAIL_POLICY.deliveryTimeoutMs + 1);
  assert.deepEqual(await deliverClaimedBookingEmail(claimed, { now: insufficientTime, sender, logger }), { outcome: "stale" });
  assert.deepEqual(await deliverClaimedBookingEmail(claimed, { now: afterLease, sender, logger }), { outcome: "stale" });
  assert.deepEqual(await deliverClaimedBookingEmail({ ...claimed.toObject(), leaseToken: randomUUID() }, {
    now: start, sender, logger,
  }), { outcome: "stale" });
  assert.equal(calls, 0);
});

test("a lease that loses its delivery budget during the ownership read cannot start SMTP", async () => {
  const queued = await job();
  const claimed = await claimBookingEmail({ now: start });
  let clockReads = 0;
  let sends = 0;
  const afterSlowRead = new Date(start.getTime() + BOOKING_EMAIL_POLICY.leaseMs - BOOKING_EMAIL_POLICY.deliveryTimeoutMs + 1);
  const outcome = await deliverClaimedBookingEmail(claimed, {
    now: () => clockReads++ === 0 ? start : afterSlowRead,
    logger,
    sender: async (current) => { sends += 1; return accepted(current); },
  });
  assert.deepEqual(outcome, { outcome: "stale" });
  assert.equal(sends, 0);
  const durable = await NotificationOutbox.findById(queued._id);
  assert.equal(durable.status, "processing");
  assert.equal(durable.attempts, 1);
  assert.equal(durable.leaseToken, claimed.leaseToken);
});

test("retry backoff is bounded and delivery stops at the maximum attempt count", async () => {
  const queued = await job();
  const policy = { retryMaxMs: 45_000 };
  let clock = start;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const claimed = await claimBookingEmail({ now: clock, policy });
    assert.equal(claimed.attempts, attempt);
    assert.deepEqual(await deliverClaimedBookingEmail(claimed, {
      now: clock, policy, logger,
      sender: async () => { const error = new Error("private diagnostics"); error.code = "arbitrary secret"; throw error; },
    }), { outcome: "failed" });
    const failed = await NotificationOutbox.findById(queued._id);
    assert.equal(failed.lastError, "booking_email_delivery_failed");
    if (attempt < 5) {
      assert.equal(failed.nextAttemptAt.getTime(), clock.getTime() + Math.min(30_000 * 2 ** (attempt - 1), 45_000));
      clock = failed.nextAttemptAt;
    } else {
      assert.equal(failed.nextAttemptAt, null);
    }
  }
  assert.equal(await claimBookingEmail({ now: new Date("2030-01-01"), policy }), null);
  assert.equal((await NotificationOutbox.findById(queued._id)).attempts, 5);
});

test("a crash on the last processing attempt becomes terminal after lease expiration", async () => {
  const queued = await job({ attempts: 4 });
  const claimed = await claimBookingEmail({ now: start });
  assert.equal(claimed.attempts, 5);
  const recoveredAt = new Date(start.getTime() + BOOKING_EMAIL_POLICY.leaseMs);
  assert.equal(await claimBookingEmail({ now: recoveredAt }), null);
  const terminal = await NotificationOutbox.findById(queued._id);
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.nextAttemptAt, null);
  assert.equal(terminal.leaseToken, null);
  assert.equal(terminal.lastError, "booking_email_processing_lease_expired");
});

test("bounded batches send serially and stop claiming after shutdown is requested", async () => {
  await Promise.all([job(), job(), job()]);
  let active = 0;
  let maximum = 0;
  let stop = false;
  const result = await dispatchBookingEmailBatch({
    now: start, logger, shouldStop: () => stop,
    sender: async (current) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      stop = true;
      return accepted(current);
    },
  });
  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0, stale: 0 });
  assert.equal(maximum, 1);
  assert.equal(await NotificationOutbox.countDocuments({ status: "pending" }), 2);
  assert.equal((await dispatchBookingEmailBatch({ now: start, sender: accepted, logger, limit: 1 })).claimed, 1);
  assert.equal(await NotificationOutbox.countDocuments({ status: "pending" }), 1);
});

test("missing recipient snapshots and future retries remain unclaimable", async () => {
  await job({ status: "failed", recipientEmail: "", recipientUserId: null, nextAttemptAt: null, lastError: "Recipient email is unavailable." });
  await job({ nextAttemptAt: new Date(start.getTime() + 1) });
  assert.equal(await claimBookingEmail({ now: start }), null);
});

test("worker CLI refuses the test environment without connecting or sending", () => {
  const result = spawnSync(process.execPath, ["scripts/dispatchBookingEmails.js", "--once"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10_000,
    env: { ...process.env, NODE_ENV: "test", MONGODB_URI: "mongodb://private:secret@unreachable.invalid/production" },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Booking email worker startup failed/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret|unreachable|MongoDB connected/);
});
