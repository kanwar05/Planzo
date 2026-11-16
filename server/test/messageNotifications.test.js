import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import Conversation from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { sendMessage, markConversationRead } from "../src/services/messagingService.js";
import { MESSAGE_EMAIL_POLICY } from "../src/services/messageNotificationService.js";
import { renderBookingEmail, setBookingEmailSenderForTests } from "../src/services/bookingEmailService.js";
import { dispatchBookingEmailBatch } from "../src/workers/bookingEmailDispatcher.js";
import { resetMessagingRateLimitsForTests } from "../src/utils/messagingRateLimit.js";

let mongo;
const models = [User, Vendor, Booking, Conversation, Message, NotificationOutbox];
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(models.map(model => model.createIndexes()));
});
beforeEach(async () => {
  for (const model of models) await model.collection.deleteMany({});
  resetMessagingRateLimitsForTests();
  setBookingEmailSenderForTests(undefined);
});
after(async () => {
  setBookingEmailSenderForTests(undefined);
  await mongoose.disconnect();
  await mongo?.stop();
});
async function fixture() {
  const [customer, owner] = await User.insertMany(["customer", "vendor"].map(role => ({
    name: `Private ${role}`, email: `${role}@example.test`, phone: "9876543210", password: "unused-test-hash",
    role, emailVerifiedAt: new Date(),
  })));
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Private Business", serviceCategory: "Decoration",
    description: "Event styling", location: "Private venue", pricing: 1000, verified: true, verificationStatus: "approved" });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date("2099-04-01T00:00:00Z"), eventLocation: "Private location", description: "Event styling" });
  return { customer, owner, booking };
}
const send = (booking, actor, body = "PRIVATE_MESSAGE_CONTENT") =>
  sendMessage(String(booking._id), actor, { clientMessageId: randomUUID(), body });
const due = job => new Date(job.nextAttemptAt.getTime() + 1000);

test("rapid messages persist one delayed generic alert without copying message or booking content", async () => {
  const { customer, booking } = await fixture();
  await send(booking, customer);
  await send(booking, customer, "ANOTHER_PRIVATE_MESSAGE");
  assert.equal(await Message.countDocuments(), 2);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
  const job = await NotificationOutbox.findOne();
  assert.equal(job.eventType, "message_received");
  assert.ok(job.nextAttemptAt.getTime() >= job.createdAt.getTime() + MESSAGE_EMAIL_POLICY.delayMs - 1000);
  const rendered = renderBookingEmail(job);
  assert.match(rendered.text, new RegExp(`/bookings/${booking._id}/messages`));
  for (const secret of ["PRIVATE_MESSAGE", "ANOTHER_PRIVATE", "Private Business", "Private location", "Private customer"])
    assert.doesNotMatch(JSON.stringify({ payload: job.payload, rendered }), new RegExp(secret));
  let sent = 0;
  setBookingEmailSenderForTests(async message => { sent += 1; return { accepted: [message.to], rejected: [] }; });
  const result = await dispatchBookingEmailBatch({ now: due(job) });
  assert.equal(result.sent, 1);
  assert.equal(sent, 1);
  assert.equal((await NotificationOutbox.findById(job._id)).status, "sent");
});

test("read conversations suppress a queued message email using a durable skipped state", async () => {
  const { customer, owner, booking } = await fixture();
  const result = await send(booking, customer);
  await markConversationRead(String(booking._id), owner, result.message.sequence);
  const job = await NotificationOutbox.findOne();
  let sent = 0;
  const batch = await dispatchBookingEmailBatch({ now: due(job), sender: async () => { sent += 1; } });
  assert.equal(batch.skipped, 1);
  assert.equal(batch.sent, 0);
  assert.equal(sent, 0);
  const skipped = await NotificationOutbox.findById(job._id);
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.sentAt, null);
  assert.equal(skipped.nextAttemptAt, null);
  assert.equal(skipped.leaseToken, null);
});

test("legacy email opt-outs and unverified mailboxes retain messages without enqueueing email", async () => {
  const { customer, owner, booking } = await fixture();
  await User.collection.updateOne({ _id: owner._id }, { $set: { "notificationPreferences.bookingUpdates": false } });
  await send(booking, customer);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
  await User.collection.updateOne({ _id: owner._id }, { $unset: { notificationPreferences: "" }, $set: { emailVerifiedAt: null } });
  await send(booking, customer);
  assert.equal(await Message.countDocuments(), 2);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
});

test("changed email routing, mailbox proof, preferences and suspension are rechecked before SMTP", async () => {
  for (const change of [{ email: "changed@example.test" }, { emailVerifiedAt: null }, { suspendedAt: new Date() },
    { accountStatus: "deactivated" }, { "notificationPreferences.bookingUpdates": false }]) {
    for (const model of models) await model.collection.deleteMany({});
    const { customer, owner, booking } = await fixture();
    await send(booking, customer);
    const job = await NotificationOutbox.findOne();
    await User.collection.updateOne({ _id: owner._id }, { $set: change });
    let sent = 0;
    const batch = await dispatchBookingEmailBatch({ now: due(job), sender: async () => { sent += 1; } });
    assert.equal(batch.skipped, 1);
    assert.equal(sent, 0);
  }
});

test("outbox failure rolls back the new message, conversation and unread counters together", async () => {
  const { customer, booking } = await fixture();
  const original = NotificationOutbox.create;
  NotificationOutbox.create = async () => { throw new Error("Simulated outbox write failure"); };
  try { await assert.rejects(send(booking, customer), /outbox write failure/); }
  finally { NotificationOutbox.create = original; }
  assert.equal(await Message.countDocuments(), 0);
  assert.equal(await Conversation.countDocuments(), 0);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
  assert.equal((await Booking.findById(booking._id)).status, "pending");
});

test("cooldown bounds burst alerts and later new messages may create a new alert", async () => {
  const { customer, booking } = await fixture();
  await send(booking, customer);
  await send(booking, customer);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
  await Conversation.updateOne({ bookingId: booking._id }, { $set: { vendorAlertAfter: new Date(0) } });
  await send(booking, customer);
  assert.equal(await NotificationOutbox.countDocuments(), 2);
  assert.equal(await Message.countDocuments(), 3);
});

test("SMTP failure retries its durable alert without changing the stored messages", async () => {
  const { customer, booking } = await fixture();
  await send(booking, customer);
  const job = await NotificationOutbox.findOne();
  const first = await dispatchBookingEmailBatch({ now: due(job), logger: { warn() {} },
    sender: async () => { throw Object.assign(new Error("PRIVATE_SMTP_ERROR"), { code: "ECONNRESET" }); } });
  assert.equal(first.failed, 1);
  const failed = await NotificationOutbox.findById(job._id);
  assert.doesNotMatch(failed.lastError, /PRIVATE/);
  const second = await dispatchBookingEmailBatch({ now: due(failed),
    sender: async row => ({ accepted: [row.recipientEmail], rejected: [] }) });
  assert.equal(second.sent, 1);
  assert.equal(await Message.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
});
