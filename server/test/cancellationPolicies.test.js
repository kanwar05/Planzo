import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import Quotation from "../src/models/Quotation.js";
import CancellationPolicy from "../src/models/CancellationPolicy.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import Availability from "../src/models/Availability.js";
import policyRoutes from "../src/routes/cancellationPolicyRoutes.js";
import bookingRoutes from "../src/routes/bookingRoutes.js";
import quotationRoutes from "../src/routes/quotationRoutes.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { cancellationEligibility, cancellationPolicyView, defaultCancellationPolicy, legacyCancellationPolicy } from "../src/services/cancellationPolicyViewService.js";

const app = express();
app.use(cookieParser()); app.use(express.json());
app.use("/api", policyRoutes);
app.use("/api/bookings", quotationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use(errorHandler);
let mongo, serial = 0;
const models = [User, Vendor, Booking, Quotation, CancellationPolicy, NotificationOutbox, Availability];
const auth = actor => `Bearer ${generateAccessToken(actor._id, actor.authVersion || 0)}`;
const futureDay = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
async function fixture() {
  const [customer, owner, other, otherOwner, admin, admin2] = await User.insertMany(["customer", "vendor", "customer", "vendor", "admin", "admin"].map(role => ({
    name: `Policy account ${++serial}`, email: `policy-${serial}@example.test`, phone: "9876543210", password: "unused-test-hash", role, emailVerifiedAt: new Date(),
  })));
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Policy Studio", serviceCategory: "Decoration",
    location: "Delhi", description: "Event decoration", pricing: 1000, verificationStatus: "approved", verified: true });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date(`${futureDay()}T00:00:00Z`), eventLocation: "Delhi hall" });
  return { customer, owner, other, otherOwner, admin, admin2, vendor, booking };
}
const publication = extra => ({ expectedVersion: 1, ...defaultCancellationPolicy(), ...extra,
  key: undefined, version: undefined });
const publish = (actor, extra = {}) => {
  const body = publication(extra); delete body.key; delete body.version;
  return request(app).post("/api/admin/cancellation-policies").set("Authorization", auth(actor)).send(body);
};
const terms = (booking, extra = {}) => ({ expectedRevision: 0, serviceDescription: "Event decoration",
  items: [{ description: "Decoration", quantity: 1, unitPriceAmount: 10000 }], additionalCharges: [], discountAmount: 0,
  serviceDate: booking.eventDateOnly, deliverables: ["Decoration"], exclusions: [], terms: "Venue access required",
  expiresAt: new Date(Date.now() + 86400000).toISOString(), ...extra });
const offer = (owner, booking, extra = {}) => request(app).post(`/api/bookings/${booking._id}/quotations`)
  .set("Authorization", auth(owner)).set("Idempotency-Key", randomUUID()).send(terms(booking, extra));
const accept = (customer, booking, acknowledgment = { key: "standard", version: 1 }) => request(app)
  .post(`/api/bookings/${booking._id}/quotations/1/accept`).set("Authorization", auth(customer))
  .send(acknowledgment === undefined ? {} : { cancellationPolicyAcknowledgment: acknowledgment });
const cancel = (actor, booking, body = {}) => request(app).patch(`/api/bookings/${booking._id}/status`)
  .set("Authorization", auth(actor)).send({ status: "cancelled", ...body });
const policy = (actor, booking) => request(app).get(`/api/bookings/${booking._id}/cancellation-policy`).set("Authorization", auth(actor));

before(async () => {
  process.env.JWT_SECRET = "policy-tests-secret-with-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(models.map(model => model.createIndexes()));
});
beforeEach(async () => { await Promise.all(models.map(model => model.collection.deleteMany({}))); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test("default policy is public and administrator publication is versioned, append-only and permission guarded", async () => {
  const { customer, owner, admin } = await fixture();
  const initial = await request(app).get("/api/cancellation-policies");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.policy.version, 1);
  assert.equal(initial.body.policy.customerAcceptedCutoffHours, 48);
  assert.equal(initial.body.policy.vendorCutoffHours, 48);
  assert.equal(initial.body.policy.timeZone, "Asia/Kolkata");
  for (const actor of [customer, owner]) assert.equal((await publish(actor)).status, 403);
  assert.equal((await request(app).post("/api/admin/cancellation-policies").send({})).status, 401);
  const changed = await publish(admin, { title: "24 hour cancellation", customerAcceptedCutoffHours: 24 });
  assert.equal(changed.status, 201, changed.body.message);
  assert.equal(changed.body.policy.version, 2);
  assert.equal((await publish(admin)).status, 409);
  const history = await request(app).get("/api/admin/cancellation-policies?limit=1").set("Authorization", auth(admin));
  assert.equal(history.body.policies[0].version, 2);
  assert.equal(history.body.pagination.hasMore, true);
  assert.equal((await request(app).get("/api/admin/cancellation-policies?beforeVersion=2").set("Authorization", auth(admin))).body.policies[0].version, 1);
  const record = await CancellationPolicy.findOne();
  assert.doesNotMatch(JSON.stringify(changed.body), /publishedById|password|email|phone/);
  await assert.rejects(CancellationPolicy.updateOne({ _id: record._id }, { $set: { title: "Rewrite" } }), /append-only/);
  await assert.rejects(record.deleteOne(), /append-only/);
});

test("simultaneous administrators publish only one next version and invalid configurations never publish", async () => {
  const { admin, admin2 } = await fixture();
  for (const extra of [{ customerAcceptedCutoffHours: -1 }, { vendorCutoffHours: 1.5 }, { customerPendingCutoffHours: "0" },
    { vendorCutoffHours: 8761 }, { title: { private: "NO" } }, { consequences: "\u0000\u202e" }, { refundPercent: 50 },
    { timeZone: "UTC" }, { timeZone: "Asia/Calcutta" }, { timeZone: { private: "NO" } }])
    assert.equal((await publish(admin, extra)).status, 400);
  const results = await Promise.all([publish(admin), publish(admin2)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal(await CancellationPolicy.countDocuments(), 1);
});

test("new quotations snapshot policies and exact acknowledgment is required before first acceptance", async () => {
  const { customer, owner, booking } = await fixture();
  assert.equal((await offer(owner, booking, { cancellationPolicy: legacyCancellationPolicy() })).status, 400);
  const quotation = await offer(owner, booking);
  assert.equal(quotation.status, 201, quotation.body.message);
  assert.deepEqual(quotation.body.quotation.cancellationPolicy, defaultCancellationPolicy());
  for (const acknowledgment of [null, true, { key: "legacy", version: 0 }, { key: "standard", version: "1" }, { key: "standard", version: 2 }, { key: "standard", version: 1, private: true }])
    assert.equal((await accept(customer, booking, acknowledgment)).status, 400);
  const missing = await request(app).post(`/api/bookings/${booking._id}/quotations/1/accept`).set("Authorization", auth(customer)).send({});
  assert.equal(missing.status, 400);
  const accepted = await accept(customer, booking);
  assert.equal(accepted.status, 200, accepted.body.message);
  assert.ok(accepted.body.booking.acceptedAgreement.cancellationPolicyAcknowledgedAt);
  const replay = await request(app).post(`/api/bookings/${booking._id}/quotations/1/accept`).set("Authorization", auth(customer)).send({});
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.booking.acceptedAgreement, accepted.body.booking.acceptedAgreement);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "booking_accepted" }), 1);
});

test("publishing later policies does not change offered or accepted cancellation snapshots", async () => {
  const { customer, owner, admin, booking } = await fixture();
  await offer(owner, booking);
  await publish(admin, { customerAcceptedCutoffHours: 24 });
  const accepted = await accept(customer, booking);
  assert.equal(accepted.status, 200, accepted.body.message);
  const agreed = accepted.body.booking.acceptedAgreement;
  assert.equal(agreed.cancellationPolicy.version, 1);
  assert.equal(agreed.cancellationPolicy.timeZone, "Asia/Kolkata");
  assert.equal(agreed.cancellationPolicy.customerAcceptedCutoffHours, 48);
  await publish(admin, { expectedVersion: 2, customerAcceptedCutoffHours: 48 });
  const current = await policy(customer, booking);
  assert.equal(current.body.policy.version, 1);
  assert.equal(current.body.source, "accepted");
  assert.equal(current.body.policy.timeZone, "Asia/Kolkata");
  assert.deepEqual(JSON.parse(JSON.stringify((await Booking.findById(booking._id)).acceptedAgreement)), agreed);
});

test("48-hour cancellation uses midnight IST on the booked date and enforces its exact UTC instant", () => {
  const booking = { status: "accepted", eventDate: new Date("2026-12-10T00:00:00Z"), eventDateOnly: "2026-12-10" };
  const value = defaultCancellationPolicy();
  const before = cancellationEligibility(booking, value, new Date("2026-12-07T18:29:59.999Z"));
  assert.equal(before.customerCanCancel, true);
  assert.equal(before.vendorCanCancel, true);
  assert.equal(before.customerCutoffAt.toISOString(), "2026-12-07T18:30:00.000Z");
  assert.equal(before.vendorCutoffAt.toISOString(), "2026-12-07T18:30:00.000Z");
  const atCutoff = cancellationEligibility(booking, value, new Date("2026-12-07T18:30:00Z"));
  assert.equal(atCutoff.customerCanCancel, false);
  assert.equal(atCutoff.vendorCanCancel, false);
  assert.equal(cancellationEligibility(booking, value, new Date("2026-12-08T00:00:00+05:30")).customerCanCancel, false);
  assert.equal(cancellationEligibility({ ...booking, status: "completed" }, value, new Date("2026-12-01")).adminCanCancel, false);
  assert.equal(booking.eventDate.toISOString(), "2026-12-10T00:00:00.000Z");
});

test("customer and vendor cutoffs block cancellation while explicit reasoned administrator overrides are audited", async () => {
  const { customer, owner, admin, booking } = await fixture();
  await publish(admin, { customerAcceptedCutoffHours: 8760, vendorCutoffHours: 8760 });
  await offer(owner, booking);
  assert.equal((await accept(customer, booking, { key: "standard", version: 2 })).status, 200);
  assert.equal((await policy(customer, booking)).body.eligibility.customerCanCancel, false);
  assert.equal((await cancel(customer, booking)).status, 409);
  assert.equal((await cancel(owner, booking, { reason: "Cannot deliver" })).status, 409);
  assert.equal((await cancel(admin, booking)).status, 409);
  assert.equal((await cancel(admin, booking, { overridePolicy: true })).status, 400);
  const result = await cancel(admin, booking, { overridePolicy: true, reason: "Support approved cancellation" });
  assert.equal(result.status, 200, result.body.message);
  assert.equal(result.body.booking.cancellation.overridePolicy, true);
  assert.equal(result.body.booking.cancellation.cancelledByRole, "admin");
  assert.equal(result.body.booking.cancellation.policySnapshot.version, 2);
});

test("vendor cancellations require sanitized reasons, authorization and one immutable terminal record", async () => {
  const { customer, owner, other, otherOwner, booking } = await fixture();
  for (const actor of [other, otherOwner]) assert.equal((await cancel(actor, booking, { reason: "Attempt" })).status, 403);
  assert.equal((await cancel(owner, booking)).status, 400);
  assert.equal((await cancel(owner, booking, { reason: "\u0000\u202e" })).status, 400);
  assert.equal((await cancel(customer, booking, { overridePolicy: true, reason: "Bypass" })).status, 403);
  assert.equal((await cancel(owner, booking, { reason: "Valid", cancellation: { cancelledByRole: "admin" } })).status, 400);
  const result = await cancel(owner, booking, { reason: "Unavailable\r\n\u202eSorry\u0000" });
  assert.equal(result.status, 200, result.body.message);
  assert.equal(result.body.booking.cancellationReason, "Unavailable\nSorry");
  assert.equal(result.body.booking.cancellation.cancelledByRole, "vendor");
  assert.equal(result.body.booking.cancellation.policySource, "legacy");
  assert.equal(result.body.booking.cancellation.cancelledById, undefined);
  assert.equal((await cancel(owner, booking, { reason: "Overwrite" })).status, 409);
  assert.deepEqual((await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer))).body.bookings[0].cancellation, result.body.booking.cancellation);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "booking_cancelled" }), 2);
});

test("legacy accepted bookings retain customer timing and old unaccepted quotations require explicit legacy acknowledgment", async () => {
  const { customer, owner, booking } = await fixture();
  await Booking.updateOne({ _id: booking._id }, { $set: { status: "accepted", eventDate: new Date("2020-04-01T00:00:00Z"), eventDateOnly: "2020-04-01" } });
  assert.equal((await policy(customer, booking)).body.policy.key, "legacy");
  assert.equal((await cancel(customer, booking)).status, 200);
  const second = await Booking.create({ customerId: customer._id, vendorId: booking.vendorId, eventType: "Wedding", eventDate: new Date(`${futureDay()}T00:00:00Z`), eventLocation: "Delhi" });
  await offer(owner, second);
  await Quotation.collection.updateOne({ bookingId: second._id }, { $unset: { cancellationPolicy: "" } });
  const history = await request(app).get(`/api/bookings/${second._id}/quotations`).set("Authorization", auth(customer));
  assert.equal(history.body.quotations[0].cancellationPolicy.key, "legacy");
  assert.equal((await accept(customer, second)).status, 400);
  const accepted = await accept(customer, second, { key: "legacy", version: 0 });
  assert.equal(accepted.status, 200, accepted.body.message);
  assert.equal(accepted.body.booking.acceptedAgreement.cancellationPolicy.key, "legacy");
});

test("concurrent cancellations persist one audit and release a reservation for a competing acceptance", async () => {
  const { customer, owner, booking } = await fixture();
  await offer(owner, booking);
  await accept(customer, booking);
  const second = await Booking.create({ customerId: customer._id, vendorId: booking.vendorId, eventType: "Wedding", eventDate: booking.eventDate, eventLocation: "Delhi" });
  const cancellations = await Promise.all([cancel(customer, booking), cancel(owner, booking, { reason: "Cannot deliver" })]);
  assert.deepEqual(cancellations.map(row => row.status).sort(), [200, 409]);
  const accepted = await request(app).patch(`/api/bookings/${second._id}/status`).set("Authorization", auth(owner)).send({ status: "accepted" });
  assert.equal(accepted.status, 200, accepted.body.message);
  assert.equal(await Booking.countDocuments({ vendorId: booking.vendorId, eventDateOnly: booking.eventDateOnly, status: { $in: ["accepted", "completed"] } }), 1);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "booking_cancelled" }), 2);
});

test("request policy snapshots preserve pending timing and policy serializers never expose nested metadata", async () => {
  const { customer, owner, other, admin, vendor } = await fixture();
  await publish(admin, { customerPendingCutoffHours: 8760 });
  const response = await request(app).post("/api/bookings").set("Authorization", auth(customer)).set("Idempotency-Key", randomUUID())
    .send({ vendorId: String(vendor._id), eventDate: futureDay(), eventType: "Wedding", eventLocation: "Delhi hall", description: "Event decoration" });
  assert.equal(response.status, 201, response.body.message);
  const booking = { _id: response.body.booking._id };
  assert.equal(response.body.booking.requestCancellationPolicy.version, 2);
  await publish(admin, { expectedVersion: 2, customerPendingCutoffHours: null });
  assert.equal((await policy(customer, booking)).body.source, "pending");
  assert.equal((await cancel(customer, booking)).status, 409);
  assert.equal((await policy(other, booking)).status, 403);
  assert.equal((await policy(owner, booking)).status, 200);
  assert.equal(cancellationPolicyView({ ...defaultCancellationPolicy(), description: { private: "PRIVATE_CONTACT" } }), null);
  assert.doesNotMatch(JSON.stringify(cancellationPolicyView({ ...defaultCancellationPolicy(), privateEmail: "PRIVATE_CONTACT" })), /PRIVATE/);
});

test("legacy accepted commercial snapshots are not retroactively acknowledged or rewritten", async () => {
  const { customer, owner, booking } = await fixture();
  await offer(owner, booking); await accept(customer, booking);
  await Booking.collection.updateOne({ _id: booking._id }, { $unset: {
    "acceptedAgreement.cancellationPolicy": "", "acceptedAgreement.cancellationPolicyAcknowledgedAt": "",
  } });
  const before = (await Booking.findById(booking._id).lean()).acceptedAgreement;
  const history = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer));
  assert.equal(history.body.bookings[0].acceptedAgreement.cancellationPolicy, undefined);
  assert.equal(history.body.bookings[0].acceptedAgreement.cancellationPolicyAcknowledgedAt, undefined);
  assert.equal((await policy(customer, booking)).body.source, "legacy");
  assert.equal((await cancel(customer, booking)).status, 200);
  assert.deepEqual((await Booking.findById(booking._id).lean()).acceptedAgreement, before);
});

test("quotation acceptance racing cancellation leaves only legal audited states and notification intents", async () => {
  const { customer, owner, booking } = await fixture();
  await offer(owner, booking);
  const [accepted, cancelled] = await Promise.all([accept(customer, booking), cancel(customer, booking)]);
  assert.ok([200, 409].includes(accepted.status), accepted.body.message);
  assert.ok([200, 409].includes(cancelled.status), cancelled.body.message);
  assert.ok(accepted.status === 200 || cancelled.status === 200);
  const final = await Booking.findById(booking._id);
  assert.equal(Boolean(final.acceptedAgreement), accepted.status === 200);
  assert.equal(Boolean(final.cancellation), cancelled.status === 200);
  assert.equal(final.status, cancelled.status === 200 ? "cancelled" : "accepted");
  if (final.cancellation) assert.equal(final.cancellation.previousStatus, accepted.status === 200 ? "accepted" : "pending");
  assert.equal(await NotificationOutbox.countDocuments(), (accepted.status === 200 ? 1 : 0) + (cancelled.status === 200 ? 2 : 0));
});

test("credential changes between request authentication and the cancellation transaction fence writes", async () => {
  const { customer, booking } = await fixture();
  const original = User.findOneAndUpdate;
  let changed = false;
  User.findOneAndUpdate = async function (...args) {
    if (!changed && String(args[0]?._id) === String(customer._id) && args[1]?.$inc?.bookingGuardRevision) {
      changed = true;
      await User.collection.updateOne({ _id: customer._id }, { $inc: { authVersion: 1 } });
    }
    return original.apply(this, args);
  };
  let result;
  try { result = await cancel(customer, booking); }
  finally { User.findOneAndUpdate = original; }
  assert.equal(result.status, 401);
  assert.equal((await Booking.findById(booking._id)).status, "pending");
  assert.equal(await NotificationOutbox.countDocuments(), 0);
});

test("publications default to IST while accepted snapshots without a time zone retain their historical UTC boundary", async () => {
  const { customer, owner, admin, booking } = await fixture();
  await offer(owner, booking); await accept(customer, booking);
  await Booking.collection.updateOne({ _id: booking._id }, { $unset: { "acceptedAgreement.cancellationPolicy.timeZone": "" } });
  const storedBefore = (await Booking.findById(booking._id).lean()).acceptedAgreement;
  const hydrated = await Booking.findById(booking._id);
  assert.equal(hydrated.acceptedAgreement.cancellationPolicy.timeZone, undefined);
  const historical = await policy(customer, booking);
  assert.equal(historical.body.policy.timeZone, "UTC");
  const expected = new Date(booking.eventDate.getTime() - 48 * 3600000).toISOString();
  assert.equal(historical.body.eligibility.customerCutoffAt, expected);
  assert.equal(historical.body.eligibility.vendorCutoffAt, expected);
  const published = await publish(admin, { timeZone: undefined, customerAcceptedCutoffHours: 72 });
  assert.equal(published.status, 201, published.body.message);
  assert.equal(published.body.policy.timeZone, "Asia/Kolkata");
  const after = await policy(customer, booking);
  assert.equal(after.body.policy.timeZone, "UTC");
  assert.equal(after.body.eligibility.customerCutoffAt, expected);
  assert.deepEqual((await Booking.findById(booking._id).lean()).acceptedAgreement, storedBefore);
  assert.equal((await Booking.findById(booking._id)).eventDate.toISOString(), booking.eventDate.toISOString());
});

test("historical UTC snapshots retain strict midnight boundaries and malformed zones never become permissive policies", () => {
  const booking = { status: "accepted", eventDate: new Date("2026-12-10T00:00:00Z"), eventDateOnly: "2026-12-10" };
  const old = { ...defaultCancellationPolicy(), timeZone: "UTC" };
  const missing = { ...old }; delete missing.timeZone;
  for (const value of [old, missing]) {
    assert.equal(cancellationEligibility(booking, value, new Date("2026-12-07T23:59:59.999Z")).customerCanCancel, true);
    assert.equal(cancellationEligibility(booking, value, new Date("2026-12-08T00:00:00Z")).customerCanCancel, false);
    assert.equal(cancellationPolicyView(value).timeZone, "UTC");
  }
  assert.equal(cancellationPolicyView({ ...old, timeZone: { privateEmail: "PRIVATE_CONTACT" } }), null);
  assert.equal(cancellationPolicyView({ ...old, timeZone: "America/New_York" }), null);
  assert.throws(() => cancellationEligibility(booking, { ...old, timeZone: "invalid" }), { statusCode: 409 });
});

test("the atomic cancellation write uses the same IST-derived UTC cutoff as policy display", async () => {
  const { customer, owner, booking } = await fixture();
  await offer(owner, booking); await accept(customer, booking);
  const expected = new Date(new Date(`${booking.eventDateOnly}T00:00:00+05:30`).getTime() - 48 * 3600000).toISOString();
  const original = Booking.findOneAndUpdate;
  let cutoff;
  Booking.findOneAndUpdate = function (...args) {
    if (args[1]?.$set?.status === "cancelled") {
      assert.equal(args[0].$expr.$lt[0], "$$NOW");
      cutoff = args[0].$expr.$lt[1].$literal;
    }
    return original.apply(this, args);
  };
  let response;
  try { response = await cancel(customer, booking); }
  finally { Booking.findOneAndUpdate = original; }
  assert.equal(response.status, 200, response.body.message);
  assert.equal(cutoff.toISOString(), expected);
  assert.equal(response.body.booking.cancellation.policySnapshot.timeZone, "Asia/Kolkata");
});
