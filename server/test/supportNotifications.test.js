import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import SupportCase from "../src/models/SupportCase.js";
import SupportCaseEvent from "../src/models/SupportCaseEvent.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { createSupportCase, addSupportCaseUpdate, manageSupportCase, resetSupportCaseRatesForTests } from "../src/services/supportCaseService.js";
import { renderBookingEmail } from "../src/services/bookingEmailService.js";
import { dispatchBookingEmailBatch } from "../src/workers/bookingEmailDispatcher.js";

let mongo;
const models = [User, Vendor, Booking, SupportCase, SupportCaseEvent, NotificationOutbox];
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(models.map(model => model.createIndexes()));
});
beforeEach(async () => {
  for (const model of models) await model.collection.deleteMany({});
  resetSupportCaseRatesForTests();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
async function fixture(orphan = false) {
  const [customer, owner, admin] = await User.insertMany(["customer", "vendor", "admin"].map(role => ({
    name: `Private ${role}`, email: `${role}@example.test`, phone: "9876543210", password: "unused-test-hash",
    role, emailVerifiedAt: role === "admin" ? null : new Date(),
  })));
  const vendor = orphan ? { _id: new mongoose.Types.ObjectId() } : await Vendor.create({ userId: owner._id,
    businessName: "Private Business", serviceCategory: "Decoration", description: "Event styling", location: "Delhi", pricing: 1000,
    verified: true, verificationStatus: "approved" });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date("2099-04-01T00:00:00Z"), eventLocation: "Private location" });
  const result = await createSupportCase(String(booking._id), customer,
    { category: "service_quality", subject: "PRIVATE_CASE_SUBJECT", description: "PRIVATE_EVIDENCE_DESCRIPTION" }, randomUUID());
  return { customer, owner, admin, booking, supportCase: result.case };
}
const deliver = options => dispatchBookingEmailBatch({ now: new Date(Date.now() + 5000),
  sender: async job => ({ accepted: [job.recipientEmail], rejected: [] }), ...options });

test("case creation and assignment enqueue durable generic alerts without case text or private notes", async () => {
  const { admin, supportCase } = await fixture();
  assert.equal(await NotificationOutbox.countDocuments(), 2);
  await manageSupportCase(supportCase._id, admin, { revision: 1, assignedAdminId: String(admin._id) });
  assert.equal(await NotificationOutbox.countDocuments(), 5);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "support_case_assigned", "payload.recipientRole": "admin" }), 1);
  await addSupportCaseUpdate(supportCase._id, admin, { revision: 2, body: "PRIVATE_ADMIN_NOTE" }, { privateNote: true });
  assert.equal(await NotificationOutbox.countDocuments(), 5);
  const jobs = await NotificationOutbox.find();
  for (const job of jobs) {
    const rendered = renderBookingEmail(job);
    assert.match(rendered.text, new RegExp(`/support/cases/${supportCase._id}`));
    assert.doesNotMatch(JSON.stringify({ payload: job.payload, rendered }), /PRIVATE_CASE|PRIVATE_EVIDENCE|PRIVATE_ADMIN|Private Business|Private location/);
  }
  const delivered = await deliver();
  assert.equal(delivered.sent, 5);
});

test("resolution and public case updates notify parties without leaking their text", async () => {
  const { owner, admin, supportCase, booking } = await fixture();
  await addSupportCaseUpdate(supportCase._id, owner, { revision: 1, body: "PRIVATE_REPLY_DETAILS" });
  await manageSupportCase(supportCase._id, admin, { revision: 2, status: "resolved", resolution: "PRIVATE_RESOLUTION_DETAILS" });
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "support_case_resolved" }), 2);
  const jobs = await NotificationOutbox.find();
  assert.doesNotMatch(JSON.stringify(jobs.map(renderBookingEmail)), /PRIVATE_REPLY|PRIVATE_RESOLUTION/);
  assert.equal((await Booking.findById(booking._id)).status, "pending");
  assert.equal((await deliver()).sent, 6);
});

test("reassigned administrators receive no stale assignment email", async () => {
  const { admin, supportCase } = await fixture();
  await manageSupportCase(supportCase._id, admin, { revision: 1, assignedAdminId: String(admin._id) });
  await manageSupportCase(supportCase._id, admin, { revision: 2, assignedAdminId: null });
  const result = await deliver();
  assert.equal(result.skipped, 1);
  assert.equal(result.sent, 6);
});

test("mailbox routing, account status and legacy notification preferences are rechecked at dispatch", async () => {
  for (const change of [{ email: "changed@example.test" }, { emailVerifiedAt: null }, { suspendedAt: new Date() },
    { "notificationPreferences.bookingUpdates": false }]) {
    for (const model of models) await model.collection.deleteMany({});
    const { customer } = await fixture();
    await User.collection.updateOne({ _id: customer._id }, { $set: change });
    const result = await deliver();
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, 1);
  }
});

test("legacy customer support can notify its customer even after a missing vendor profile", async () => {
  const { supportCase } = await fixture(true);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
  assert.equal((await deliver()).sent, 1);
  assert.equal((await SupportCase.findById(supportCase._id)).status, "open");
});

test("SMTP failures preserve support state and retry the same durable alert", async () => {
  const { supportCase } = await fixture();
  const before = await SupportCase.findById(supportCase._id).lean();
  const result = await deliver({ logger: { warn() {} }, sender: async () => {
    throw Object.assign(new Error("PRIVATE_SMTP_SECRET"), { code: "ECONNRESET" });
  } });
  assert.equal(result.failed, 2);
  const failed = await NotificationOutbox.findOne();
  assert.doesNotMatch(failed.lastError, /PRIVATE/);
  assert.deepEqual(await SupportCase.findById(supportCase._id).lean(), before);
  const retry = await deliver({ now: new Date(failed.nextAttemptAt.getTime() + 1000) });
  assert.equal(retry.sent, 2);
  assert.equal(await NotificationOutbox.countDocuments(), 2);
});
