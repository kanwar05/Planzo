import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
const dayPlus = (days = 14) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const auth = (user) => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
const newUser = (role = "customer") => User.create({
  name: `${role} ${++sequence}`, email: `lifecycle-${sequence}@example.test`,
  phone: `99900${String(sequence).padStart(5, "0")}`, password: "PlanzoLifecycle123!", role,
  emailVerifiedAt: new Date(),
});
async function fixture() {
  const [customer, owner, admin] = await Promise.all([newUser(), newUser("vendor"), newUser("admin")]);
  const vendor = await Vendor.create({
    userId: owner._id, businessName: "Lifecycle Events", serviceCategory: "Decoration",
    description: "Event decoration services.", pricing: 12000, location: "Delhi",
    verificationStatus: "approved",
  });
  return { customer, owner, admin, vendor };
}
const payload = (vendor, extra = {}) => ({
  vendorId: String(vendor._id), eventDate: dayPlus(), eventType: "Wedding",
  eventLocation: "Delhi event hall", description: "A family wedding.", ...extra,
});
function create(customer, body, key) {
  const call = request(app).post("/api/bookings").set("Authorization", auth(customer));
  return (key === undefined ? call : call.set("Idempotency-Key", key)).send(body);
}
const update = (user, id, status, extra = {}, adminRoute = false) => request(app)
  .patch(adminRoute ? `/api/admin/bookings/${id}` : `/api/bookings/${id}/status`)
  .set("Authorization", auth(user)).send({ status, ...extra });
const stored = (id) => Booking.findById(id).lean();
const jobs = (id) => NotificationOutbox.find({ bookingId: id }).sort({ _id: 1 }).lean();

before(async () => {
  process.env.JWT_SECRET = "booking-lifecycle-tests-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Availability.init(), NotificationOutbox.init()]);
});
beforeEach(async () => {
  mock.timers.reset();
  mock.restoreAll();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});
after(async () => {
  mock.timers.reset();
  mock.restoreAll();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("vendor and both admin status endpoints reject completion until the next UTC day without writes or email", async () => {
  const { customer, owner, admin, vendor } = await fixture();
  mock.timers.enable({ apis: ["Date"], now: new Date("2028-02-29T23:59:59.999Z").getTime() });
  const created = await create(customer, payload(vendor, { eventDate: "2028-02-29" }));
  assert.equal(created.status, 201, created.body.message);
  const id = created.body.booking._id;
  assert.equal((await update(owner, id, "accepted")).status, 200);
  const previous = await stored(id);
  const previousJobs = await jobs(id);
  for (const [actor, adminRoute] of [[owner, false], [admin, false], [admin, true]]) {
    const premature = await update(actor, id, "completed", {}, adminRoute);
    assert.equal(premature.status, 409, premature.body.message);
    assert.deepEqual(await stored(id), previous);
    assert.deepEqual(await jobs(id), previousJobs);
  }
  mock.timers.tick(1);
  const completed = await update(owner, id, "completed");
  assert.equal(completed.status, 200, completed.body.message);
  assert.equal(completed.body.booking.eventDateOnly, "2028-02-29");
  assert.equal(await NotificationOutbox.countDocuments({ bookingId: id, eventType: "booking_completed" }), 1);
  assert.equal((await update(owner, id, "completed")).status, 409);
});

test("creation and acceptance switch calendar days at UTC midnight while cancellation remains permitted", async () => {
  const { customer, owner, vendor } = await fixture();
  mock.timers.enable({ apis: ["Date"], now: new Date("2028-03-01T00:00:00Z").getTime() });
  const created = await create(customer, payload(vendor, { eventDate: "2028-03-01" }));
  assert.equal(created.status, 201);
  const previousDay = await create(customer, payload(vendor, { eventDate: "2028-02-29" }));
  assert.equal(previousDay.status, 400);
  mock.timers.tick(86400000);
  assert.equal((await update(owner, created.body.booking._id, "accepted")).status, 409);
  assert.equal((await update(customer, created.body.booking._id, "cancelled", { reason: "Event postponed" })).status, 200);
});

test("concurrent completion and cancellation preserve one legal terminal state and one event intent", async () => {
  const { customer, owner, vendor } = await fixture();
  const day = dayPlus(-1);
  const booking = await Booking.create({ ...payload(vendor, { eventDate: day }),
    eventDateOnly: day, customerId: customer._id, status: "accepted" });
  const results = await Promise.all([
    update(owner, booking._id, "completed"), update(customer, booking._id, "cancelled", { reason: "Plans changed" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const final = await stored(booking._id);
  assert.ok(["completed", "cancelled"].includes(final.status));
  const intents = await jobs(booking._id);
  assert.equal(intents.length, final.status === "completed" ? 1 : 2);
  assert.ok(intents.every((job) => job.eventType === `booking_${final.status}`));
});

test("keyed retries replay the original booking after acceptance or expiry of its creation date without a second intent", async () => {
  const { customer, owner, vendor } = await fixture();
  const key = randomUUID();
  const body = payload(vendor, { notes: "  Bring flowers  " });
  const created = await create(customer, body, key);
  assert.equal(created.status, 201, created.body.message);
  const id = created.body.booking._id;
  assert.equal((await update(owner, id, "accepted")).status, 200);
  const previousJobs = await jobs(id);
  // Replays do not need a currently bookable vendor or an unreserved future day.
  await Vendor.updateOne({ _id: vendor._id }, { $set: { verificationStatus: "pending" } });
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 20 * 86400000 });
  const replay = await create(customer, { ...body, notes: "Bring flowers" }, key);
  assert.equal(replay.status, 200, replay.body.message);
  assert.equal(replay.body.booking._id, id);
  assert.equal(replay.body.booking.status, "accepted");
  assert.equal(await Booking.countDocuments({}), 1);
  assert.deepEqual(await jobs(id), previousJobs);
  for (const field of ["idempotencyKeyHash", "requestHash"])
    assert.equal(JSON.stringify(replay.body).includes(field), false);
});

test("simultaneous requests with one key create exactly one booking and one outbox job", async () => {
  const { customer, vendor } = await fixture();
  const key = randomUUID();
  const body = payload(vendor);
  const responses = await Promise.all(Array.from({ length: 6 }, () => create(customer, body, key)));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 5,
    responses.map((response) => `${response.status}: ${response.body.message}`).join("; "));
  assert.equal(new Set(responses.map((response) => response.body.booking._id)).size, 1);
  assert.equal(await Booking.countDocuments({}), 1);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "booking_requested" }), 1);
});

test("a failed transaction does not consume a key and a later retry commits one complete booking intent", async () => {
  const { customer, vendor } = await fixture();
  const key = randomUUID();
  const body = payload(vendor);
  const original = NotificationOutbox.insertMany;
  const failedEnqueue = mock.method(NotificationOutbox, "insertMany", async function (...args) {
    await original.apply(this, args);
    throw new Error("Injected booking-intent failure");
  });
  try {
    assert.equal((await create(customer, body, key)).status, 500);
  } finally {
    failedEnqueue.mock.restore();
  }
  assert.equal(await Booking.countDocuments({}), 0);
  assert.equal(await NotificationOutbox.countDocuments({}), 0);
  const retry = await create(customer, body, key);
  assert.equal(retry.status, 201, retry.body.message);
  assert.equal((await create(customer, body, key)).status, 200);
  assert.equal(await Booking.countDocuments({}), 1);
  assert.equal(await NotificationOutbox.countDocuments({}), 1);
});

test("a reused key with changed payload conflicts, including simultaneous mismatched submissions", async () => {
  const { customer, vendor } = await fixture();
  const key = randomUUID();
  const body = payload(vendor);
  const responses = await Promise.all([
    create(customer, body, key), create(customer, { ...body, description: "Different request" }, key),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await Booking.countDocuments({}), 1);
  assert.equal(await NotificationOutbox.countDocuments({}), 1);
  const winner = responses.find((response) => response.status === 201);
  const changed = await create(customer, { ...body, eventLocation: "Another event hall" }, key);
  assert.equal(changed.status, 409);
  assert.equal((await stored(winner.body.booking._id)).eventLocation, body.eventLocation);
});

test("keys are customer-scoped and preserve the independent vendor/date reservation index", async () => {
  const { customer, owner, vendor } = await fixture();
  const secondCustomer = await newUser();
  const key = randomUUID();
  const body = payload(vendor);
  const [first, second] = await Promise.all([create(customer, body, key), create(secondCustomer, body, key)]);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.body.booking._id, second.body.booking._id);
  assert.equal((await update(owner, first.body.booking._id, "accepted")).status, 200);
  assert.equal((await update(owner, second.body.booking._id, "accepted")).status, 409);
  assert.equal((await create(customer, body, key)).body.booking._id, first.body.booking._id);
});

test("the partial idempotency index enforces keyed uniqueness without indexing legacy unkeyed bookings", async () => {
  const { customer, vendor } = await fixture();
  const first = await create(customer, payload(vendor), randomUUID());
  assert.equal(first.status, 201);
  const source = await Booking.findById(first.body.booking._id).select("+idempotencyKeyHash +requestHash").lean();
  await assert.rejects(Booking.collection.insertOne({ ...source, _id: new mongoose.Types.ObjectId() }), { code: 11000 });
  const index = (await Booking.collection.indexes()).find((entry) => entry.name === "one_booking_per_customer_idempotency_key");
  assert.deepEqual(index.key, { customerId: 1, idempotencyKeyHash: 1 });
  assert.equal(index.unique, true);
  assert.deepEqual(index.partialFilterExpression, { idempotencyKeyHash: { $type: "string" } });
  delete source.idempotencyKeyHash;
  delete source.requestHash;
  await Booking.collection.insertMany([
    { ...source, _id: new mongoose.Types.ObjectId() }, { ...source, _id: new mongoose.Types.ObjectId() },
  ]);
  assert.equal(await Booking.countDocuments({}), 3);
});

test("invalid idempotency headers fail without writes and legacy unkeyed callers remain compatible", async () => {
  const { customer, vendor } = await fixture();
  const body = payload(vendor);
  for (const key of ["short", "x".repeat(129), "not a safe key with spaces"])
    assert.equal((await create(customer, body, key)).status, 400);
  assert.equal(await Booking.countDocuments({}), 0);
  assert.equal(await NotificationOutbox.countDocuments({}), 0);
  assert.equal((await create(customer, body)).status, 201);
  assert.equal((await create(customer, body)).status, 201);
});

test("reasons reject malformed values, remove control characters and remain restricted to booking participants", async () => {
  const { customer, owner, vendor } = await fixture();
  const stranger = await newUser();
  for (const status of ["cancelled", "rejected"]) {
    const created = await create(customer, payload(vendor));
    const id = created.body.booking._id;
    const actor = status === "cancelled" ? customer : owner;
    for (const reason of [null, 123, {}, ["bad"], "x".repeat(1001)]) {
      assert.equal((await update(actor, id, status, { reason })).status, 400);
      assert.equal((await stored(id)).status, "pending");
    }
    const result = await update(actor, id, status, { reason: "  Plans\u0000 changed\r\nNew date\u202e  " });
    assert.equal(result.status, 200, result.body.message);
    assert.equal(result.body.booking[status === "cancelled" ? "cancellationReason" : "rejectionReason"], "Plans changed\nNew date");
    assert.equal((await update(stranger, id, status, { reason: "Replace private reason" })).status, 403);
  }
  const unrelated = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(stranger));
  assert.deepEqual(unrelated.body.bookings, []);
});
