import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, mock, test } from "node:test";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import SupportCase from "../src/models/SupportCase.js";
import SupportCaseEvent from "../src/models/SupportCaseEvent.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import supportRoutes from "../src/routes/supportCaseRoutes.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { createSupportCase, resetSupportCaseRatesForTests } from "../src/services/supportCaseService.js";
import { supportCaseView, supportCaseEventView } from "../src/services/supportCaseViewService.js";

const app = express();
app.use(express.json()); app.use("/api", supportRoutes); app.use(errorHandler);
const models = [User, Vendor, Booking, SupportCase, SupportCaseEvent, NotificationOutbox];
let mongo, serial = 0;
const auth = actor => `Bearer ${generateAccessToken(actor._id, actor.authVersion || 0)}`;
async function fixture() {
  const [customer, owner, stranger, otherVendor, admin, secondAdmin] = await User.insertMany(
    ["customer", "vendor", "customer", "vendor", "admin", "admin"].map(role => ({
      name: `Support ${role} ${++serial}`, email: `support-${serial}@example.test`, phone: "9876543210",
      password: "unused-test-hash", role, emailVerifiedAt: new Date(),
    })));
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Support Studio", serviceCategory: "Decoration",
    description: "Event decoration", location: "Delhi", pricing: 1000, verified: true, verificationStatus: "approved" });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date("2099-04-01T00:00:00Z"), eventLocation: "Delhi garden", description: "A garden event" });
  return { customer, owner, stranger, otherVendor, admin, secondAdmin, vendor, booking };
}
const content = extra => ({ category: "vendor_unresponsive", subject: "Vendor coordination", description: "Please help coordinate this booking.", ...extra });
const open = (actor, booking, extra = {}, key = randomUUID()) => request(app).post(`/api/bookings/${booking._id}/support-cases`)
  .set("Authorization", auth(actor)).set("Idempotency-Key", key).send(content(extra));
const details = (actor, record) => request(app).get(`/api/support/cases/${record._id}`).set("Authorization", auth(actor));
const timeline = (actor, record, query = {}) => request(app).get(`/api/support/cases/${record._id}/events`).query(query).set("Authorization", auth(actor));
const comment = (actor, record, body = "Public coordination update") => request(app).post(`/api/support/cases/${record._id}/updates`)
  .set("Authorization", auth(actor)).send({ revision: record.revision, body });
const note = (actor, record, body = "PRIVATE_ADMIN_NOTE") => request(app).post(`/api/admin/support/cases/${record._id}/notes`)
  .set("Authorization", auth(actor)).send({ revision: record.revision, body });
const manage = (actor, record, change) => request(app).patch(`/api/admin/support/cases/${record._id}`)
  .set("Authorization", auth(actor)).send({ revision: record.revision, ...change });
const requireCase = response => { assert.equal(response.status, 201, response.body.message); return response.body.case; };

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "support-tests-secret-with-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(models.map(model => model.createIndexes()));
});
beforeEach(async () => {
  mock.restoreAll(); resetSupportCaseRatesForTests();
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
});
after(async () => { mock.restoreAll(); await mongoose.disconnect(); await mongo?.stop(); });

test("participants open private booking-linked cases with a public audit event and durable routing intent", async () => {
  const { customer, owner, admin, booking } = await fixture();
  const record = requireCase(await open(customer, booking, { subject: " \u202eVendor\r\ncoordination\u0000 ", description: "<script>plain text</script>" }));
  assert.equal(record.subject, "Vendor\ncoordination");
  assert.equal(record.description, "<script>plain text</script>");
  assert.equal(record.revision, 1);
  assert.equal(record.status, "open");
  assert.equal(await SupportCase.countDocuments(), 1);
  assert.equal(await SupportCaseEvent.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "support_case_created" }), 2);
  for (const actor of [customer, owner, admin]) {
    const response = await details(actor, record);
    assert.equal(response.status, 200, response.body.message);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body.booking._id, String(booking._id));
    assert.doesNotMatch(JSON.stringify(response.body), /creationKeyHash|creationRequestHash|password|PRIVATE_ACCOUNT/);
  }
});

test("guest, foreign accounts and admin creation cannot bypass participant permissions or mailbox proof", async () => {
  const { customer, owner, stranger, otherVendor, admin, booking } = await fixture();
  const record = requireCase(await open(customer, booking));
  assert.equal((await request(app).get(`/api/support/cases/${record._id}`)).status, 401);
  for (const actor of [stranger, otherVendor]) {
    assert.equal((await details(actor, record)).status, 403);
    assert.equal((await timeline(actor, record)).status, 403);
    assert.equal((await comment(actor, record)).status, 403);
    assert.equal((await open(actor, booking, { category: "service_quality" })).status, 403);
  }
  assert.equal((await open(admin, booking, { category: "service_quality" })).status, 403);
  assert.equal((await note(customer, record)).status, 403);
  assert.equal((await manage(owner, record, { status: "resolved", resolution: "Spoofed decision" })).status, 403);
  await User.collection.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: null } });
  assert.equal((await details(owner, record)).status, 200);
  assert.equal((await timeline(owner, record)).status, 200);
  assert.equal((await comment(owner, record)).status, 403);
  assert.equal((await open(owner, booking, { category: "service_quality" })).status, 403);
  await User.collection.updateOne({ _id: owner._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await details(owner, record)).status, 403);
});

test("concurrent create retries preserve one case, one audit event and one pair of notifications", async () => {
  const { customer, booking } = await fixture();
  const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 6 }, () => open(customer, booking, {}, key)));
  assert.equal(responses.filter(row => row.status === 201).length, 1);
  assert.ok(responses.every(row => [200, 201].includes(row.status)), JSON.stringify(responses.map(row => row.body)));
  assert.equal(new Set(responses.map(row => row.body.case._id)).size, 1);
  assert.equal(await SupportCase.countDocuments(), 1);
  assert.equal(await SupportCaseEvent.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 2);
  assert.equal((await open(customer, booking, { description: "Different support request" }, key)).status, 409);
});

test("one active category case covers both participants and closed-case reopening cannot collide with a replacement", async () => {
  const { customer, owner, admin, booking } = await fixture();
  const responses = await Promise.all([open(customer, booking), open(owner, booking)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
  let record = responses.find(row => row.status === 201).body.case;
  let response = await manage(admin, record, { status: "resolved", resolution: "Coordination guidance supplied." });
  assert.equal(response.status, 200, response.body.message); record = response.body.case;
  response = await manage(admin, record, { status: "closed" });
  assert.equal(response.status, 200); record = response.body.case;
  const replacement = requireCase(await open(customer, booking));
  const reopen = await manage(admin, record, { status: "investigating", reason: "New evidence received." });
  assert.equal(reopen.status, 409);
  assert.equal((await SupportCase.findById(record._id)).status, "closed");
  assert.equal((await SupportCase.findById(replacement._id)).status, "open");
  assert.equal(await SupportCaseEvent.countDocuments({ caseId: record._id }), 3);
});

test("private admin notes are excluded before participant pagination and never create email jobs", async () => {
  const { customer, owner, admin, booking } = await fixture();
  let record = requireCase(await open(customer, booking));
  let response = await note(admin, record); assert.equal(response.status, 200); record = response.body.case;
  response = await comment(customer, record, "PUBLIC_CASE_UPDATE"); assert.equal(response.status, 200); record = response.body.case;
  response = await note(admin, record, "SECOND_PRIVATE_ADMIN_NOTE"); assert.equal(response.status, 200); record = response.body.case;
  assert.equal(await NotificationOutbox.countDocuments(), 4);
  for (const actor of [customer, owner]) {
    const first = await timeline(actor, record, { limit: 1 });
    assert.equal(first.status, 200); assert.equal(first.body.events.length, 1);
    assert.equal(first.body.events[0].body, "PUBLIC_CASE_UPDATE");
    assert.equal(first.body.pagination.hasMore, true);
    assert.equal(first.body.pagination.nextBefore, 3);
    const second = await timeline(actor, record, { limit: 1, before: first.body.pagination.nextBefore });
    assert.equal(second.body.events[0].kind, "created");
    assert.equal(second.body.pagination.hasMore, false);
    assert.doesNotMatch(JSON.stringify({ first: first.body, second: second.body, detail: (await details(actor, record)).body }), /PRIVATE_ADMIN_NOTE|private_note|actorId|assignedAdminId|visibility/);
  }
  const all = await timeline(admin, record);
  assert.equal(all.body.events.length, 4);
  assert.equal(all.body.events.filter(row => row.kind === "private_note").length, 2);
  assert.doesNotMatch(JSON.stringify(await NotificationOutbox.find().lean()), /PRIVATE_ADMIN_NOTE|PUBLIC_CASE_UPDATE/);
});

test("stale and simultaneous updates use one revision and cannot duplicate public notifications", async () => {
  const { customer, booking } = await fixture();
  const record = requireCase(await open(customer, booking));
  const responses = await Promise.all([comment(customer, record), comment(customer, record)]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  assert.equal(await SupportCaseEvent.countDocuments(), 2);
  assert.equal(await NotificationOutbox.countDocuments(), 4);
  assert.equal((await SupportCase.findById(record._id)).revision, 2);
});

test("assignments require active administrators and expose only safe participant assignment metadata", async () => {
  const { customer, admin, secondAdmin, booking } = await fixture();
  let record = requireCase(await open(customer, booking));
  assert.equal((await manage(admin, record, { assignedAdminId: String(customer._id) })).status, 400);
  await User.collection.updateOne({ _id: secondAdmin._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await manage(admin, record, { assignedAdminId: String(secondAdmin._id) })).status, 403);
  await User.collection.updateOne({ _id: secondAdmin._id }, { $set: { suspendedAt: null } });
  let response = await manage(admin, record, { assignedAdminId: String(secondAdmin._id) });
  assert.equal(response.status, 200, response.body.message); record = response.body.case;
  assert.equal(record.assignedAdminId, String(secondAdmin._id));
  assert.equal(await NotificationOutbox.countDocuments({ eventType: "support_case_assigned" }), 3);
  const participant = await details(customer, record);
  assert.equal(participant.body.case.assigned, true);
  assert.equal(participant.body.case.assignedAdminId, undefined);
  assert.equal((await manage(admin, record, { assignedAdminId: String(secondAdmin._id) })).status, 409);
  response = await manage(admin, record, { assignedAdminId: null });
  assert.equal(response.status, 200); assert.equal(response.body.case.assigned, false);
  assert.equal((await manage(admin, response.body.case, { status: "investigating", assignedAdminId: String(admin._id) })).status, 400);
});

test("resolution, closure and reopening follow controlled transitions and retain their audit history", async () => {
  const { customer, admin, booking } = await fixture();
  let record = requireCase(await open(customer, booking));
  assert.equal((await manage(admin, record, { status: "closed" })).status, 409);
  assert.equal((await manage(admin, record, { status: "resolved" })).status, 400);
  let response = await manage(admin, record, { status: "investigating", reason: "Evidence review started." });
  assert.equal(response.status, 200); record = response.body.case;
  response = await manage(admin, record, { status: "resolved", resolution: "Agreed service outcome recorded; no financial action executed." });
  assert.equal(response.status, 200); record = response.body.case;
  assert.ok(record.resolvedAt);
  response = await manage(admin, record, { status: "closed" });
  assert.equal(response.status, 200); record = response.body.case;
  assert.ok(record.closedAt);
  assert.equal((await comment(customer, record)).status, 409);
  assert.equal((await manage(admin, record, { status: "investigating" })).status, 400);
  response = await manage(admin, record, { status: "investigating", reason: "Additional service evidence warrants review." });
  assert.equal(response.status, 200);
  assert.equal(response.body.event.kind, "reopened");
  assert.equal(await SupportCaseEvent.countDocuments(), 5);
  assert.equal((await Booking.findById(booking._id)).status, "pending");
});

test("support decisions preserve accepted commercial snapshots, reservations and booking business state", async () => {
  const { customer, owner, admin, booking, vendor } = await fixture();
  booking.status = "accepted";
  booking.acceptedAgreement = { quotationId: new mongoose.Types.ObjectId(), revision: 1, acceptedAt: new Date(),
    serviceDescription: "Agreed decoration", items: [{ description: "Flowers", quantity: 1, unitPriceAmount: 10000 }],
    subtotalAmount: 10000, totalAmount: 10000, discountAmount: 0, currency: "INR", serviceDate: "2099-04-01",
    deliverables: ["Flowers"], exclusions: [], terms: "No financial action from support.", expiresAt: new Date("2099-03-01") };
  await booking.save();
  const before = await Booking.findById(booking._id).lean();
  let record = requireCase(await open(customer, booking, { category: "payment_refund_question" }));
  assert.equal(record.agreementSnapshot.totalAmount, 10000);
  await Vendor.updateOne({ _id: vendor._id }, { $set: { businessName: "Changed public vendor name" } });
  const response = await manage(admin, record, { status: "resolved", resolution: "Future payment concerns recorded; no payment or refund was performed." });
  assert.equal(response.status, 200); record = response.body.case;
  assert.equal(record.agreementSnapshot.totalAmount, 10000);
  assert.deepEqual(await Booking.findById(booking._id).lean(), before);
  assert.equal(await Booking.countDocuments({ vendorId: vendor._id, status: "accepted" }), 1);
  assert.equal((await details(owner, record)).status, 200);
});

test("failed notification insertion rolls back support creation and later public mutation", async () => {
  const { customer, booking } = await fixture();
  const original = NotificationOutbox.insertMany;
  NotificationOutbox.insertMany = async () => { throw new Error("Simulated support outbox failure"); };
  try { assert.equal((await open(customer, booking)).status, 500); }
  finally { NotificationOutbox.insertMany = original; }
  assert.equal(await SupportCase.countDocuments(), 0);
  assert.equal(await SupportCaseEvent.countDocuments(), 0);
  const record = requireCase(await open(customer, booking));
  NotificationOutbox.insertMany = async () => { throw new Error("Simulated support outbox failure"); };
  try { assert.equal((await comment(customer, record)).status, 500); }
  finally { NotificationOutbox.insertMany = original; }
  assert.equal((await SupportCase.findById(record._id)).revision, 1);
  assert.equal(await SupportCaseEvent.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 2);
});

test("legacy missing-vendor bookings can request customer support without exposing another owner's case", async () => {
  const { customer, owner, otherVendor, admin, booking, vendor } = await fixture();
  let record = requireCase(await open(customer, booking));
  await Vendor.collection.updateOne({ _id: vendor._id }, { $set: { userId: otherVendor._id } });
  assert.equal((await details(owner, record)).status, 403);
  assert.equal((await details(otherVendor, record)).status, 403);
  assert.equal((await details(customer, record)).status, 200);
  assert.equal((await details(admin, record)).status, 200);
  await Vendor.collection.deleteOne({ _id: vendor._id });
  record = requireCase(await open(customer, booking, { category: "service_not_delivered" }));
  assert.equal((await details(customer, record)).status, 200);
  assert.equal((await details(admin, record)).status, 200);
  assert.equal((await SupportCase.findById(record._id)).vendorUserId, null);
});

test("admin filtering and timeline pagination reject malformed values and keep stable boundaries", async () => {
  const { customer, admin, booking } = await fixture();
  for (const category of ["vendor_unresponsive", "service_quality", "vendor_no_show"]) requireCase(await open(customer, booking, { category }));
  const list = query => request(app).get("/api/admin/support/cases").set("Authorization", auth(admin)).query(query);
  const first = await list({ limit: 2, page: 1 });
  const second = await list({ limit: 2, page: 2 });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal(first.body.pagination.total, 3); assert.equal(first.body.pagination.hasNextPage, true);
  assert.equal(new Set([...first.body.cases, ...second.body.cases].map(row => row._id)).size, 3);
  assert.equal((await list({ category: "service_quality", status: "open", assignedTo: "unassigned" })).body.cases.length, 1);
  assert.equal((await list({ search: "[.*" })).body.cases.length, 0);
  for (const query of [{ limit: 51 }, { page: 0 }, { status: ["open", "resolved"] }, { category: { $ne: "open" } }, { assignedTo: "not-an-id" }, { ignored: "field" }])
    assert.equal((await list(query)).status, 400, JSON.stringify(query));
  assert.equal((await request(app).get("/api/admin/support/cases").set("Authorization", auth(customer))).status, 403);
  const record = first.body.cases[0];
  for (const query of [{ before: 0 }, { before: { $ne: 1 } }, { limit: 51 }, { ignored: true }]) assert.equal((await timeline(customer, record, query)).status, 400, JSON.stringify(query));
});

test("support input validation and serializers do not accept identities, evidence URLs or nested private data", async () => {
  const { customer, booking } = await fixture();
  for (const extra of [{ category: "unknown" }, { subject: "x".repeat(161) }, { description: "\u0000\u202e" },
    { customerId: String(customer._id) }, { evidence: [{ url: "https://foreign.example/secret" }] }, { status: "resolved" }])
    assert.equal((await open(customer, booking, extra)).status, 400);
  const poison = { privateEmail: "PRIVATE_CONTACT" };
  const record = supportCaseView({ _id: new mongoose.Types.ObjectId(), subject: poison, description: poison, resolution: poison,
    creationKeyHash: "PRIVATE_HASH", assignedAdminId: poison,
    evidence: [{ evidenceId: new mongoose.Types.ObjectId(), publicId: "PRIVATE_PROVIDER_REFERENCE", sha256: "PRIVATE_HASH",
      format: "png", bytes: 20, uploaderId: customer._id, uploaderRole: "customer", createdAt: new Date(), url: "PRIVATE_URL" }] }, customer);
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE_|publicId|sha256|uploaderId|assignedAdminId/);
  assert.equal(record.evidence.length, 1);
  assert.equal(supportCaseEventView({ visibility: "admin", body: "PRIVATE_NOTE" }, customer), null);
  assert.doesNotMatch(JSON.stringify(supportCaseEventView({ visibility: "participants", body: poison, actorId: customer._id, assignedAdminId: poison }, customer)), /PRIVATE_|actorId|assignedAdminId/);
});

test("support history is append-only and retired support collections remain untouched", async () => {
  const { customer, booking } = await fixture();
  const legacy = mongoose.connection.db.collection("supportcases");
  await legacy.insertOne({ oldIssue: "PRESERVED_LEGACY_DATA" });
  const record = requireCase(await open(customer, booking));
  const event = await SupportCaseEvent.findOne({ caseId: record._id });
  await assert.rejects(SupportCaseEvent.updateOne({ _id: event._id }, { $set: { body: "Mutated" } }), /append-only/);
  await assert.rejects(SupportCaseEvent.deleteMany({ caseId: record._id }), /append-only/);
  assert.equal((await legacy.findOne()).oldIssue, "PRESERVED_LEGACY_DATA");
});

test("credential changes between initial permission checks and the transaction fence case creation", async () => {
  const { customer, booking } = await fixture();
  const original = mongoose.startSession;
  let changed = false;
  mongoose.startSession = async function (...args) {
    if (!changed) { changed = true; await User.collection.updateOne({ _id: customer._id }, { $inc: { authVersion: 1 } }); }
    return original.apply(this, args);
  };
  try { await assert.rejects(createSupportCase(String(booking._id), customer, content(), randomUUID()), { statusCode: 401 }); }
  finally { mongoose.startSession = original; }
  assert.equal(await SupportCase.countDocuments(), 0);
  assert.equal(await SupportCaseEvent.countDocuments(), 0);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
});
