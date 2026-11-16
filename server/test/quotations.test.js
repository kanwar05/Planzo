import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import Quotation from "../src/models/Quotation.js";
import Availability from "../src/models/Availability.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { normalizeQuotation } from "../src/services/quotationService.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
const day = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const auth = actor => `Bearer ${generateAccessToken(actor._id, actor.authVersion || 0)}`;
const user = (role, extra = {}) => User.create({
  name: `Quote Account ${++sequence}`, email: `quotes-${sequence}@example.test`, phone: "9876543210",
  password: "QuotationSecure123!", role, emailVerifiedAt: new Date(), ...extra,
});
async function fixture() {
  const [customer, owner, otherCustomer, otherOwner, admin] = await Promise.all([
    user("customer"), user("vendor"), user("customer"), user("vendor"), user("admin"),
  ]);
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Quotation Studio", serviceCategory: "Decoration",
    description: "Thoughtful event decoration.", location: "Delhi", pricing: 5000,
    verificationStatus: "approved", verified: true, contactDetails: { email: "business@example.test" } });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date(`${day()}T00:00:00.000Z`), eventLocation: "Delhi event hall", description: "A wedding celebration." });
  return { customer, owner, otherCustomer, otherOwner, admin, vendor, booking };
}
const terms = (extra = {}) => ({ expectedRevision: 0, serviceDescription: "Wedding decoration and setup",
  items: [{ description: "Floral arrangement", quantity: 2, unitPriceAmount: 125050 }],
  additionalCharges: [{ description: "Delivery", amount: 20000 }], discountAmount: 10000,
  serviceDate: day(), deliverables: ["Two floral arrangements", "Setup and removal"], exclusions: ["Venue rental"],
  terms: "Venue access must be available before setup.", expiresAt: new Date(Date.now() + 86400000).toISOString(), ...extra });
const offer = (actor, bookingId, body = terms(), key = randomUUID()) => request(app)
  .post(`/api/bookings/${bookingId}/quotations`).set("Authorization", auth(actor)).set("Idempotency-Key", key).send(body);
const decide = (actor, bookingId, revision = 1, action = "accept") => request(app)
  .post(`/api/bookings/${bookingId}/quotations/${revision}/${action}`).set("Authorization", auth(actor)).send({});
const history = (actor, bookingId) => request(app).get(`/api/bookings/${bookingId}/quotations`).set("Authorization", auth(actor));
const stored = bookingId => Booking.findById(bookingId).lean();

before(async () => {
  process.env.JWT_SECRET = "quotation-tests-secret-with-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Quotation.init(), Availability.init(), NotificationOutbox.init()]);
});
beforeEach(async () => {
  mock.restoreAll();
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  await mongo?.stop();
});

test("quotation money is integer INR paise and server totals ignore supplied totals", () => {
  const value = normalizeQuotation(terms({ totalAmount: 1, subtotalAmount: 1, currency: "INR" }));
  assert.equal(value.subtotalAmount, 250100);
  assert.equal(value.totalAmount, 260100);
  assert.equal(value.currency, "INR");
  for (const invalid of [
    { items: [] }, { items: [{ description: "Item", quantity: 0, unitPriceAmount: 100 }] },
    { items: [{ description: "Item", quantity: 1.5, unitPriceAmount: 100 }] },
    { items: [{ description: "Item", quantity: 1, unitPriceAmount: 1.2 }] },
    { items: [{ description: "Item", quantity: 1, unitPriceAmount: -1 }] },
    { items: [{ description: "Item", quantity: 1_000_000, unitPriceAmount: 100_000_000_000 }] },
    { discountAmount: 999999999 }, { additionalCharges: [{ description: "Charge", amount: "100" }] },
    { currency: "USD" }, { serviceDate: "2027-02-30" }, { expiresAt: "2027-02-30T00:00:00Z" },
    { expiresAt: "2027-02-01" }, { serviceDescription: { private: "nested" } },
    { terms: "x".repeat(4001) }, { serviceDescription: "\u0000\u202e" }, { deliverables: ["\u0000\u2066"] },
  ]) assert.throws(() => normalizeQuotation(terms(invalid)), { statusCode: 400 });
});

test("only the verified vendor owner can offer quotations and only participants/admin see history", async () => {
  const { customer, owner, otherCustomer, otherOwner, admin, booking } = await fixture();
  for (const actor of [customer, otherCustomer, otherOwner, admin])
    assert.equal((await offer(actor, booking._id)).status, 403);
  await User.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: null } });
  const blocked = await offer(owner, booking._id);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "EMAIL_VERIFICATION_REQUIRED");
  await User.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: new Date() } });
  assert.equal((await offer(owner, booking._id)).status, 201);
  for (const actor of [customer, owner, admin]) assert.equal((await history(actor, booking._id)).status, 200);
  for (const actor of [otherCustomer, otherOwner]) assert.equal((await history(actor, booking._id)).status, 403);
  assert.equal((await request(app).get(`/api/bookings/${booking._id}/quotations`)).status, 401);
});

test("revisions are append-only, optimistic and idempotent without changing pending booking state", async () => {
  const { customer, owner, booking } = await fixture();
  const body = terms();
  const key = randomUUID();
  const initial = await offer(owner, booking._id, body, key);
  assert.equal(initial.status, 201, initial.body.message);
  assert.equal(initial.body.quotation.revision, 1);
  assert.equal(initial.body.quotation.totalAmount, 260100);
  const replayed = await offer(owner, booking._id, body, key);
  assert.equal(replayed.status, 200, replayed.body.message);
  assert.equal(replayed.body.quotation._id, initial.body.quotation._id);
  assert.equal((await offer(owner, booking._id, { ...body, terms: "Changed" }, key)).status, 409);
  assert.equal((await offer(owner, booking._id, body)).status, 409);
  const revised = await offer(owner, booking._id, terms({ expectedRevision: 1, discountAmount: 20000 }));
  assert.equal(revised.status, 201, revised.body.message);
  assert.equal(revised.body.quotation.revision, 2);
  assert.equal(revised.body.quotation.totalAmount, 250100);
  const revisions = (await history(customer, booking._id)).body.quotations;
  assert.deepEqual(revisions.map(row => row.revision), [2, 1]);
  assert.equal(revisions[1].totalAmount, 260100);
  assert.equal((await stored(booking._id)).status, "pending");
  assert.equal(await NotificationOutbox.countDocuments(), 0);
  await assert.rejects(Quotation.updateOne({ _id: initial.body.quotation._id }, { $set: { totalAmount: 1 } }), /append-only/);
  await assert.rejects(Quotation.deleteOne({ _id: initial.body.quotation._id }), /append-only/);
  const record = await Quotation.findById(initial.body.quotation._id);
  record.terms = "Changed after issue";
  await assert.rejects(record.save(), /append-only/);
});

test("customer acceptance atomically reserves the date and freezes exact terms despite later vendor/package edits", async () => {
  const { customer, owner, otherCustomer, otherOwner, admin, vendor, booking } = await fixture();
  const packageId = new mongoose.Types.ObjectId();
  await Booking.collection.updateOne({ _id: booking._id }, { $set: { selectedPackage: { packageId, title: "Original package" } } });
  const created = await offer(owner, booking._id);
  assert.equal(created.status, 201, created.body.message);
  for (const actor of [owner, otherOwner, otherCustomer, admin]) assert.equal((await decide(actor, booking._id)).status, 403);
  const accepted = await decide(customer, booking._id);
  assert.equal(accepted.status, 200, accepted.body.message);
  const value = await stored(booking._id);
  assert.equal(value.status, "accepted");
  assert.equal(value.quotationStatus, "accepted");
  assert.equal(value.acceptedAgreement.totalAmount, 260100);
  assert.equal(value.acceptedAgreement.selectedPackageTitle, "Original package");
  assert.equal(String(value.acceptedAgreement.quotationId), created.body.quotation._id);
  assert.equal(value.acceptedAgreement.revision, 1);
  assert.equal(value.acceptedAgreement.currency, "INR");
  assert.ok(value.acceptedAgreement.acceptedAt instanceof Date);
  const snapshot = structuredClone(value.acceptedAgreement);
  await Vendor.updateOne({ _id: vendor._id }, { $set: { businessName: "New business", pricing: 1 } });
  assert.deepEqual((await stored(booking._id)).acceptedAgreement, value.acceptedAgreement);
  assert.equal((await offer(owner, booking._id, terms({ expectedRevision: 1 }))).status, 409);
  assert.equal((await decide(customer, booking._id)).status, 200);
  assert.equal(await NotificationOutbox.countDocuments({ bookingId: booking._id, eventType: "booking_accepted" }), 1);
  // Normal booking cancellation preserves the commercial audit snapshot.
  const cancelled = await request(app).patch(`/api/bookings/${booking._id}/status`).set("Authorization", auth(customer))
    .send({ status: "cancelled", reason: "Plans changed" });
  assert.equal(cancelled.status, 200);
  assert.equal((await decide(customer, booking._id)).status, 200);
  assert.equal(JSON.stringify((await stored(booking._id)).acceptedAgreement), JSON.stringify(value.acceptedAgreement));
  assert.ok(snapshot.totalAmount === 260100);
});

test("rejection keeps a request pending and vendor can issue a new revision; stale revisions cannot be accepted", async () => {
  const { customer, owner, booking } = await fixture();
  assert.equal((await offer(owner, booking._id)).status, 201);
  assert.equal((await decide(customer, booking._id, 1, "reject")).status, 200);
  assert.equal((await decide(customer, booking._id, 1, "reject")).status, 200);
  assert.equal((await stored(booking._id)).status, "pending");
  assert.equal((await stored(booking._id)).quotationStatus, "rejected");
  assert.equal((await decide(customer, booking._id)).status, 409);
  assert.equal((await offer(owner, booking._id, terms({ expectedRevision: 1 }))).status, 201);
  assert.equal((await decide(customer, booking._id, 1)).status, 409);
  assert.equal((await decide(customer, booking._id, 2)).status, 200);
});

test("expired quotations and changed service dates fail without reservation or notification changes", async () => {
  const { customer, owner, booking } = await fixture();
  const yesterday = new Date(Date.now() - 1000).toISOString();
  assert.equal((await offer(owner, booking._id, terms({ expiresAt: yesterday }))).status, 400);
  assert.equal((await offer(owner, booking._id, terms({ serviceDate: new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10) }))).status, 400);
  assert.equal((await offer(owner, booking._id)).status, 201);
  await Quotation.collection.updateOne({ bookingId: booking._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  const expired = await decide(customer, booking._id);
  assert.equal(expired.status, 409);
  assert.equal((await stored(booking._id)).status, "pending");
  assert.equal((await stored(booking._id)).acceptedAgreement, undefined);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
});

test("simultaneous quote submissions with one key create one revision and only a current revision wins", async () => {
  const { owner, booking } = await fixture();
  const key = randomUUID();
  const body = terms();
  const responses = await Promise.all(Array.from({ length: 5 }, () => offer(owner, booking._id, body, key)));
  assert.equal(responses.filter(row => row.status === 201).length, 1, JSON.stringify(responses.map(row => row.body)));
  assert.equal(responses.filter(row => row.status === 200).length, 4);
  assert.equal(await Quotation.countDocuments({ bookingId: booking._id }), 1);
  const revisions = await Promise.all([
    offer(owner, booking._id, terms({ expectedRevision: 1, terms: "Revision A" })),
    offer(owner, booking._id, terms({ expectedRevision: 1, terms: "Revision B" })),
  ]);
  assert.deepEqual(revisions.map(row => row.status).sort(), [201, 409]);
  assert.equal(await Quotation.countDocuments({ bookingId: booking._id }), 2);
});

test("acceptance racing revision or rejection commits one current decision without conflicting agreements", async () => {
  const { customer, owner, booking } = await fixture();
  assert.equal((await offer(owner, booking._id)).status, 201);
  const results = await Promise.all([
    decide(customer, booking._id), offer(owner, booking._id, terms({ expectedRevision: 1 })),
  ]);
  assert.equal(results.filter(row => [200, 201].includes(row.status)).length, 1);
  assert.equal(results.filter(row => row.status === 409).length, 1);
  const final = await stored(booking._id);
  if (final.status === "accepted") {
    assert.equal(final.quotationRevision, 1);
    assert.equal(final.acceptedAgreement.revision, 1);
    assert.equal(await NotificationOutbox.countDocuments(), 1);
  } else {
    assert.equal(final.status, "pending");
    assert.equal(final.quotationRevision, 2);
    assert.equal(final.acceptedAgreement, undefined);
    assert.equal(await NotificationOutbox.countDocuments(), 0);
  }
});

test("reservation conflicts prevent two accepted agreements and outbox failures roll back acceptance", async () => {
  const { customer, owner, otherCustomer, vendor, booking } = await fixture();
  const second = await Booking.create({ customerId: otherCustomer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: booking.eventDate, eventLocation: "Other hall", description: "Other event" });
  assert.equal((await offer(owner, booking._id)).status, 201);
  assert.equal((await offer(owner, second._id)).status, 201);
  const outcomes = await Promise.all([decide(customer, booking._id), decide(otherCustomer, second._id)]);
  assert.deepEqual(outcomes.map(row => row.status).sort(), [200, 409]);
  assert.equal(await Booking.countDocuments({ status: "accepted" }), 1);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "booking_accepted" }), 1);
  const loser = outcomes[0].status === 409 ? { actor: customer, booking } : { actor: otherCustomer, booking: second };
  await Booking.collection.updateMany({ status: "accepted" }, { $set: { status: "cancelled" } });
  const broken = mock.method(NotificationOutbox, "insertMany", async () => { throw new Error("Injected queue failure"); });
  assert.equal((await decide(loser.actor, loser.booking._id)).status, 500);
  broken.mock.restore();
  assert.equal((await stored(loser.booking._id)).status, "pending");
  assert.equal((await stored(loser.booking._id)).acceptedAgreement, undefined);
  assert.equal((await decide(loser.actor, loser.booking._id)).status, 200);
});

test("duplicate customer accepts replay one agreement while opposing accept/reject actions commit one decision", async () => {
  const first = await fixture();
  assert.equal((await offer(first.owner, first.booking._id)).status, 201);
  const accepted = await Promise.all(Array.from({ length: 4 }, () => decide(first.customer, first.booking._id)));
  assert.ok(accepted.every(result => result.status === 200));
  assert.equal(new Set(accepted.map(result => result.body.booking.acceptedAgreement.acceptedAt)).size, 1);
  assert.equal(await NotificationOutbox.countDocuments({ bookingId: first.booking._id }), 1);

  const second = await fixture();
  assert.equal((await offer(second.owner, second.booking._id)).status, 201);
  const outcomes = await Promise.all([
    decide(second.customer, second.booking._id), decide(second.customer, second.booking._id, 1, "reject"),
  ]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
  const final = await stored(second.booking._id);
  assert.ok(["accepted", "rejected"].includes(final.quotationStatus));
  assert.equal(Boolean(final.acceptedAgreement), final.quotationStatus === "accepted");
  assert.equal(await NotificationOutbox.countDocuments({ bookingId: second.booking._id }), final.quotationStatus === "accepted" ? 1 : 0);
});

test("acceptance rechecks blocked dates, vendor eligibility and current customer mailbox proof", async () => {
  const { customer, owner, vendor, booking } = await fixture();
  assert.equal((await offer(owner, booking._id)).status, 201);
  await Availability.create({ vendorId: vendor._id, unavailableDates: [day()] });
  assert.equal((await decide(customer, booking._id)).status, 409);
  await Availability.deleteMany({ vendorId: vendor._id });
  await Vendor.updateOne({ _id: vendor._id }, { $set: { verificationStatus: "pending", verified: false } });
  assert.equal((await decide(customer, booking._id)).status, 409);
  await Vendor.updateOne({ _id: vendor._id }, { $set: { verificationStatus: "approved", verified: true } });
  await User.updateOne({ _id: customer._id }, { $set: { emailVerifiedAt: null } });
  const unverified = await decide(customer, booking._id);
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.code, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal((await stored(booking._id)).status, "pending");
  assert.equal((await stored(booking._id)).acceptedAgreement, undefined);
  assert.equal(await NotificationOutbox.countDocuments({ bookingId: booking._id }), 0);
});

test("quote and agreement serializers never expose request metadata or private account contacts", async () => {
  const { customer, owner, booking } = await fixture();
  const created = await offer(owner, booking._id);
  assert.equal(created.status, 201);
  const serialized = JSON.stringify(created.body.quotation);
  assert.doesNotMatch(serialized, /requestKeyHash|requestHash|createdById|customerId|quotes-\d+@example|9876543210|password/);
  await Quotation.collection.updateOne({ bookingId: booking._id }, { $set: { privateEmail: "PRIVATE_CONTACT", requestHash: "a".repeat(64) } });
  const rows = await history(customer, booking._id);
  assert.equal(rows.status, 200);
  assert.doesNotMatch(JSON.stringify(rows.body), /PRIVATE_CONTACT|requestHash|requestKeyHash/);
});

test("quotation history retains every permitted revision and refuses unbounded further revisions", async () => {
  const { customer, owner, booking } = await fixture();
  assert.equal((await offer(owner, booking._id)).status, 201);
  const source = await Quotation.findOne({ bookingId: booking._id }).select("+createdById +requestKeyHash +requestHash").lean();
  await Quotation.collection.insertMany(Array.from({ length: 99 }, (_, index) => ({
    ...source, _id: new mongoose.Types.ObjectId(), revision: index + 2,
    requestKeyHash: (index + 2).toString(16).padStart(64, "0"),
  })));
  await Booking.collection.updateOne({ _id: booking._id }, { $set: { quotationRevision: 100 } });
  const denied = await offer(owner, booking._id, terms({ expectedRevision: 100 }));
  assert.equal(denied.status, 409);
  assert.match(denied.body.message, /at most 100/);
  assert.equal(await Quotation.countDocuments({ bookingId: booking._id }), 100);
  const result = await history(customer, booking._id);
  assert.equal(result.status, 200);
  assert.equal(result.body.quotations.length, 100);
  assert.equal(result.body.quotations[0].revision, 100);
  assert.equal(result.body.quotations.at(-1).revision, 1);
});
