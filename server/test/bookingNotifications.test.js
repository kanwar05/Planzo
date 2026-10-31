import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Availability from "../src/models/Availability.js";
import Booking from "../src/models/Booking.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { setBookingEmailSenderForTests } from "../src/services/bookingEmailService.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
let sentEmails;
const datePlus = (days = 14) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const auth = (user) => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;

function newUser(role = "customer") {
  sequence += 1;
  return User.create({
    name: `${role} ${sequence}`,
    email: `notifications-${sequence}@example.com`,
    phone: `987650${String(sequence).padStart(4, "0")}`,
    password: "PlanzoNotifications123!",
    role,
  });
}

async function fixtures() {
  const [customer, owner, admin] = await Promise.all([
    newUser(), newUser("vendor"), newUser("admin"),
  ]);
  const vendor = await Vendor.create({
    userId: owner._id,
    businessName: "Planzo Celebration Services",
    serviceCategory: "Decoration",
    description: "Decoration for celebrations.",
    location: "Delhi",
    pricing: 15000,
    verificationStatus: "approved",
    contactDetails: { email: "shared-business@example.com", phone: "8888888888" },
  });
  return { customer, owner, admin, vendor };
}

const create = ({ customer, vendor }, extra = {}) =>
  request(app).post("/api/bookings").set("Authorization", auth(customer)).send({
    vendorId: String(vendor._id),
    eventType: "Wedding",
    eventDate: datePlus(),
    eventLocation: "Delhi event hall",
    description: "A family celebration.",
    ...extra,
  });
const change = (user, id, status, adminRoute = false, extra = {}) =>
  request(app).patch(adminRoute ? `/api/admin/bookings/${id}` : `/api/bookings/${id}/status`)
    .set("Authorization", auth(user)).send({ status, ...extra });
const jobs = (bookingId, eventType) => NotificationOutbox.find({
  ...(bookingId ? { bookingId } : {}),
  ...(eventType ? { eventType } : {}),
}).sort({ _id: 1 }).lean();

function assertRecipients(rows, eventType, recipients) {
  assert.equal(rows.length, recipients.length);
  assert.deepEqual(rows.map((row) => String(row.recipientUserId)).sort(),
    recipients.map((user) => String(user._id)).sort());
  for (const row of rows) {
    const recipient = recipients.find((user) => String(user._id) === String(row.recipientUserId));
    assert.equal(row.eventType, eventType);
    assert.equal(row.recipientEmail, recipient.email);
    assert.match(row.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(row.status, "pending");
    assert.equal(row.attempts, 0);
    assert.ok(row.nextAttemptAt instanceof Date);
    assert.ok(row.createdAt instanceof Date);
    assert.ok(!row.sentAt);
    assert.ok(!row.leaseToken);
    assert.ok(!row.leaseExpiresAt);
  }
}

before(async () => {
  process.env.JWT_SECRET = "booking-notifications-test-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(), Vendor.init(), Booking.init(), Availability.init(), NotificationOutbox.init(),
  ]);
});

beforeEach(async () => {
  mock.restoreAll();
  await Promise.all(Object.values(mongoose.connection.collections)
    .map((collection) => collection.deleteMany({})));
  sentEmails = [];
  setBookingEmailSenderForTests(async (message) => {
    sentEmails.push(message);
    return { accepted: [message.to], rejected: [] };
  });
});

after(async () => {
  mock.restoreAll();
  setBookingEmailSenderForTests(undefined);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("booking creation queues one vendor request using the account email and never sends SMTP inline", async () => {
  const fixture = await fixtures();
  const response = await create(fixture);
  assert.equal(response.status, 201, response.body.message);
  const rows = await jobs(response.body.booking._id);
  assertRecipients(rows, "booking_requested", [fixture.owner]);
  assert.equal(rows[0].payload.customerName, fixture.customer.name);
  assert.equal(rows[0].payload.vendorName, fixture.vendor.businessName);
  assert.equal(rows[0].payload.service, fixture.vendor.serviceCategory);
  assert.equal(rows[0].payload.eventDateOnly, datePlus());
  assert.equal(rows[0].payload.eventLocation, "Delhi event hall");
  assert.equal(rows[0].payload.recipientRole, "vendor");
  assert.notEqual(rows[0].recipientEmail, fixture.vendor.contactDetails.email);
  await User.updateOne({ _id: fixture.owner._id }, { $set: { email: "changed-address@example.com" } });
  assert.equal((await jobs(response.body.booking._id))[0].recipientEmail, fixture.owner.email);
  assert.deepEqual(sentEmails, []);
});

for (const [status, eventType] of [
  ["accepted", "booking_accepted"],
  ["rejected", "booking_rejected"],
  ["completed", "booking_completed"],
]) {
  test(`${status} booking queues exactly one customer email after the successful transition`, async () => {
    const fixture = await fixtures();
    const created = await create(fixture);
    assert.equal(created.status, 201, created.body.message);
    const id = created.body.booking._id;
    if (status === "completed")
      assert.equal((await change(fixture.owner, id, "accepted")).status, 200);
    const response = await change(fixture.owner, id, status);
    assert.equal(response.status, 200, response.body.message);
    assertRecipients(await jobs(id, eventType), eventType, [fixture.customer]);
    assertRecipients(await jobs(id, "booking_requested"), "booking_requested", [fixture.owner]);
    assert.equal((await jobs(id, eventType))[0].payload.recipientRole, "customer");
    assert.deepEqual(sentEmails, []);
  });
}

test("customer and admin cancellations notify both participants including the customer actor", async () => {
  const fixture = await fixtures();
  for (const [actor, adminRoute, day] of [
    [fixture.customer, false, 20], [fixture.admin, true, 21],
  ]) {
    const created = await create(fixture, { eventDate: datePlus(day) });
    assert.equal(created.status, 201, created.body.message);
    const id = created.body.booking._id;
    if (adminRoute)
      assert.equal((await change(fixture.owner, id, "accepted")).status, 200);
    const response = await change(actor, id, "cancelled", adminRoute, { reason: "Plans changed" });
    assert.equal(response.status, 200, response.body.message);
    const rows = await jobs(id, "booking_cancelled");
    assertRecipients(rows, "booking_cancelled", [fixture.customer, fixture.owner]);
    assert.equal(new Set(rows.map((row) => row.eventId)).size, 1);
    assert.equal(rows.some((row) => String(row.recipientUserId) === String(fixture.admin._id)), false);
    assert.equal((await Booking.findById(id)).status, "cancelled");
  }
  assert.deepEqual(sentEmails, []);
});

test("invalid and unauthorized booking operations create no notification jobs", async () => {
  const fixture = await fixtures();
  const stranger = await newUser();
  const otherOwner = await newUser("vendor");
  const created = await create(fixture);
  const id = created.body.booking._id;
  const before = await jobs();
  const operations = [
    [() => create(fixture, { eventDate: "2027-02-30" }), 400],
    [() => create(fixture, { description: "" }), 400],
    [() => request(app).post("/api/bookings").send({}), 401],
    [() => change(fixture.owner, "invalid-id", "accepted"), 400],
    [() => change(fixture.owner, new mongoose.Types.ObjectId(), "accepted"), 404],
    [() => change(stranger, id, "cancelled"), 403],
    [() => change(otherOwner, id, "accepted"), 403],
    [() => change(fixture.customer, id, "accepted"), 403],
    [() => change(fixture.owner, id, "cancelled"), 403],
    [() => change(fixture.owner, id, "completed"), 409],
    [() => change(fixture.customer, id, "rejected", true), 403],
    [() => change(fixture.owner, id, "rejected", false, { reason: "a".repeat(1001) }), 400],
    [() => change(fixture.owner, id, "unknown"), 400],
  ];
  for (const [operation, expected] of operations) {
    const response = await operation();
    assert.equal(response.status, expected, response.body.message);
    assert.deepEqual(await jobs(), before);
  }
  assert.equal((await Booking.findById(id)).status, "pending");
  assert.deepEqual(sentEmails, []);
});

test("concurrent transitions queue only the winning event and HTTP 409 repeats queue nothing", async () => {
  const fixture = await fixtures();
  for (const [action, day] of [["accepted", 30], ["rejected", 31], ["cancelled", 32]]) {
    const created = await create(fixture, { eventDate: datePlus(day) });
    const id = created.body.booking._id;
    const actor = action === "cancelled" ? fixture.customer : fixture.owner;
    const responses = await Promise.all([
      change(actor, id, action, false, { reason: "First explanation" }),
      change(actor, id, action, false, { reason: "Second explanation" }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409], action);
    const eventType = `booking_${action}`;
    assertRecipients(await jobs(id, eventType), eventType,
      action === "cancelled" ? [fixture.customer, fixture.owner] : [fixture.customer]);
    const before = await jobs(id);
    assert.equal(before.length, action === "cancelled" ? 3 : 2);
    assert.equal((await change(actor, id, action)).status, 409);
    assert.equal((await change(fixture.admin, id, action, true)).status, 409);
    assert.deepEqual(await jobs(id), before);
  }
  const requested = await jobs(null, "booking_requested");
  assert.equal(new Set(requested.map((row) => row.eventId)).size, 3,
    "Unrelated booking requests must have distinct event identities.");
  assert.deepEqual(sentEmails, []);
});

test("genuine reservation conflicts and unsuccessful new requests queue nothing", async () => {
  const fixture = await fixtures();
  const first = await create(fixture);
  const second = await create(fixture);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal((await change(fixture.owner, first.body.booking._id, "accepted")).status, 200);
  let before = await jobs();
  for (const actor of [fixture.owner, fixture.admin]) {
    assert.equal((await change(actor, second.body.booking._id, "accepted", actor.role === "admin")).status, 409);
    assert.deepEqual(await jobs(), before);
  }
  assert.equal((await create(fixture)).status, 409);
  assert.deepEqual(await jobs(), before);
  assert.equal((await change(fixture.owner, first.body.booking._id, "completed")).status, 200);
  before = await jobs();
  assert.equal((await change(fixture.owner, second.body.booking._id, "accepted")).status, 409);
  assert.deepEqual(await jobs(), before);
  assert.equal((await Booking.findById(second.body.booking._id)).status, "pending");
  assert.deepEqual(sentEmails, []);
});

test("new bookings and notification jobs remain invisible until their shared transaction commits", async () => {
  const fixture = await fixtures();
  const original = NotificationOutbox.insertMany;
  let inspected = false;
  const mocked = mock.method(NotificationOutbox, "insertMany", async function (documents, options) {
    assert.ok(options.session.inTransaction());
    const inserted = await original.call(this, documents, options);
    assert.equal(await Booking.countDocuments({ vendorId: fixture.vendor._id }).session(options.session), 1);
    assert.equal(await NotificationOutbox.countDocuments({}).session(options.session), 1);
    assert.equal(await Booking.countDocuments({ vendorId: fixture.vendor._id }), 0);
    assert.equal(await NotificationOutbox.countDocuments({}), 0);
    inspected = true;
    return inserted;
  });
  let response;
  try {
    response = await create(fixture);
  } finally {
    mocked.mock.restore();
  }
  assert.equal(response.status, 201, response.body.message);
  assert.equal(inspected, true);
  assert.equal(await Booking.countDocuments({}), 1);
  assert.equal(await NotificationOutbox.countDocuments({}), 1);
  assert.deepEqual(sentEmails, []);
});

test("an enqueue failure rolls back creation even after booking and outbox inserts", async () => {
  const fixture = await fixtures();
  const original = NotificationOutbox.insertMany;
  const mocked = mock.method(NotificationOutbox, "insertMany", async function (documents, options) {
    assert.ok(options.session.inTransaction());
    await original.call(this, documents, options);
    assert.equal(await Booking.countDocuments({}).session(options.session), 1);
    throw new Error("Injected outbox insertion failure");
  });
  let response;
  try {
    response = await create(fixture);
  } finally {
    mocked.mock.restore();
  }
  assert.equal(response.status, 500);
  assert.equal(await Booking.countDocuments({}), 0);
  assert.equal(await NotificationOutbox.countDocuments({}), 0);
  assert.deepEqual(sentEmails, []);
});

test("enqueue failure rolls back each status write, including its vendor guard and inserted jobs", async () => {
  const fixture = await fixtures();
  let day = 40;
  for (const action of ["accepted", "rejected", "cancelled", "completed"]) {
    const created = await create(fixture, { eventDate: datePlus(day++) });
    assert.equal(created.status, 201, created.body.message);
    const id = created.body.booking._id;
    if (action === "completed")
      assert.equal((await change(fixture.owner, id, "accepted")).status, 200);
    const previousBooking = await Booking.findById(id).lean();
    const previousVendor = await Vendor.findById(fixture.vendor._id).select("+bookingRevision").lean();
    const previousJobs = await jobs();
    const original = NotificationOutbox.insertMany;
    const mocked = mock.method(NotificationOutbox, "insertMany", async function (documents, options) {
      assert.ok(options.session.inTransaction());
      await original.call(this, documents, options);
      assert.equal((await Booking.findById(id).session(options.session)).status, action);
      throw new Error("Injected outbox insertion failure");
    });
    let response;
    try {
      response = await change(action === "cancelled" ? fixture.customer : fixture.owner, id, action);
    } finally {
      mocked.mock.restore();
    }
    assert.equal(response.status, 500, action);
    assert.deepEqual(await Booking.findById(id).lean(), previousBooking, action);
    assert.deepEqual(await Vendor.findById(fixture.vendor._id).select("+bookingRevision").lean(), previousVendor, action);
    assert.deepEqual(await jobs(), previousJobs, action);
  }
  assert.deepEqual(sentEmails, []);
});

test("outbox snapshots remain internal and never copy private contacts into template payloads", async () => {
  const fixture = await fixtures();
  const created = await create(fixture);
  const id = created.body.booking._id;
  const accepted = await change(fixture.owner, id, "accepted");
  assert.equal(accepted.status, 200, accepted.body.message);
  const mine = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(fixture.customer));
  assert.equal(mine.status, 200);
  for (const response of [created, accepted, mine]) {
    const serialized = JSON.stringify(response.body);
    for (const secret of [fixture.customer.email, fixture.owner.email, fixture.customer.phone, fixture.owner.phone])
      assert.equal(serialized.includes(secret), false);
    for (const internal of ["recipientEmail", "recipientUserId", "leaseToken", "eventId", "notificationOutbox"])
      assert.equal(serialized.includes(internal), false);
  }
  assert.equal(created.body.booking.vendorId.contactDetails, undefined);
  assert.equal(mine.body.bookings[0].vendorId.contactDetails.email, fixture.vendor.contactDetails.email);
  for (const row of await jobs(id)) {
    const payload = JSON.stringify(row.payload);
    for (const secret of [fixture.customer.email, fixture.owner.email, fixture.customer.phone, fixture.owner.phone,
      "PlanzoNotifications123!", "authVersion", "passwordResetTokenHash"])
      assert.equal(payload.includes(secret), false);
  }
  assert.deepEqual(sentEmails, []);
});

test("the installed outbox index enforces event and recipient identity across cancellation recipients and unrelated bookings", async () => {
  const index = (await NotificationOutbox.collection.indexes())
    .find((entry) => entry.name === "one_booking_email_per_event_recipient");
  assert.deepEqual(index.key, { eventId: 1, recipientUserId: 1 });
  assert.equal(index.unique, true);
  const fixture = await fixtures();
  for (const day of [50, 51]) {
    const created = await create(fixture, { eventDate: datePlus(day) });
    assert.equal(created.status, 201);
    assert.equal((await change(fixture.customer, created.body.booking._id, "cancelled")).status, 200);
    const rows = await jobs(created.body.booking._id, "booking_cancelled");
    assertRecipients(rows, "booking_cancelled", [fixture.customer, fixture.owner]);
    assert.equal(new Set(rows.map((row) => row.eventId)).size, 1);
  }
  const cancellations = await jobs(null, "booking_cancelled");
  assert.equal(cancellations.length, 4);
  assert.equal(new Set(cancellations.map((row) => row.eventId)).size, 2);
  const existing = cancellations[0];
  await assert.rejects(
    NotificationOutbox.collection.insertOne({ ...existing, _id: new mongoose.Types.ObjectId() }),
    (error) => error.code === 11000 && error.keyPattern?.eventId === 1 && error.keyPattern?.recipientUserId === 1,
  );
  assert.equal((await jobs(null, "booking_cancelled")).length, 4);
  assert.deepEqual(sentEmails, []);
});

test("orphaned legacy customers do not block booking management and retain terminal failed notification intent", async () => {
  const fixture = await fixtures();
  const pendingRejection = await create(fixture, { eventDate: datePlus(60) });
  const acceptedCompletion = await create(fixture, { eventDate: datePlus(61) });
  const pendingCancellation = await create(fixture, { eventDate: datePlus(62) });
  for (const response of [pendingRejection, acceptedCompletion, pendingCancellation])
    assert.equal(response.status, 201);
  assert.equal((await change(fixture.owner, acceptedCompletion.body.booking._id, "accepted")).status, 200);
  await User.deleteOne({ _id: fixture.customer._id });

  for (const [created, actor, action, adminRoute] of [
    [pendingRejection, fixture.owner, "rejected", false],
    [acceptedCompletion, fixture.owner, "completed", false],
    [pendingCancellation, fixture.admin, "cancelled", true],
  ]) {
    const id = created.body.booking._id;
    const response = await change(actor, id, action, adminRoute);
    assert.equal(response.status, 200, response.body.message);
    assert.equal((await Booking.findById(id)).status, action);
    const rows = await jobs(id, `booking_${action}`);
    assert.equal(rows.length, action === "cancelled" ? 2 : 1);
    const failedCustomer = rows.find((row) => String(row.recipientUserId) === String(fixture.customer._id));
    assert.ok(failedCustomer);
    assert.equal(failedCustomer.recipientEmail, "");
    assert.equal(failedCustomer.status, "failed");
    assert.equal(failedCustomer.attempts, 0);
    assert.equal(failedCustomer.nextAttemptAt, null);
    assert.equal(failedCustomer.lastError, "Recipient email is unavailable.");
    assert.equal(failedCustomer.payload.customerName, "");
    if (action === "cancelled") {
      const vendorRows = rows.filter((row) => String(row.recipientUserId) === String(fixture.owner._id));
      assertRecipients(vendorRows, "booking_cancelled", [fixture.owner]);
    }
  }
  assert.deepEqual(sentEmails, []);
});

test("a transient transaction retry preserves one request event identity and booking reference", async () => {
  const fixture = await fixtures();
  const attempts = [];
  const original = NotificationOutbox.insertMany;
  const mocked = mock.method(NotificationOutbox, "insertMany", async function (documents, options) {
    assert.ok(options.session.inTransaction());
    attempts.push(documents.map((document) => ({
      eventId: document.eventId,
      bookingId: String(document.bookingId),
      recipientUserId: String(document.recipientUserId),
    })));
    const inserted = await original.call(this, documents, options);
    if (attempts.length === 1) {
      const transient = new mongoose.mongo.MongoServerError({
        message: "Injected transient transaction conflict", code: 112,
      });
      transient.addErrorLabel("TransientTransactionError");
      throw transient;
    }
    return inserted;
  });
  let response;
  try {
    response = await create(fixture);
  } finally {
    mocked.mock.restore();
  }
  assert.equal(response.status, 201, response.body.message);
  assert.ok(attempts.length >= 2);
  for (const attempted of attempts)
    assert.deepEqual(attempted, attempts[0]);
  assert.equal(attempts[0][0].bookingId, response.body.booking._id);
  assert.equal(await Booking.countDocuments({}), 1);
  const rows = await jobs();
  assertRecipients(rows, "booking_requested", [fixture.owner]);
  assert.equal(rows[0].eventId, attempts[0][0].eventId);
  assert.deepEqual(sentEmails, []);
});
