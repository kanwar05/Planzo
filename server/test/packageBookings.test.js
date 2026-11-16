import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import VendorPackage from "../src/models/VendorPackage.js";
import Quotation from "../src/models/Quotation.js";
import Booking from "../src/models/Booking.js";
import Availability from "../src/models/Availability.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { bookingView } from "../src/services/bookingViewService.js";

let mongo;
let sequence = 0;
const auth = user => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
const user = role => User.create({ name: `Account ${++sequence}`, email: `package-booking-${sequence}@example.test`,
  phone: "9876543210", password: "PlanzoSecure123!", role, emailVerifiedAt: new Date() });
const profile = owner => Vendor.create({ userId: owner._id, businessName: "Studio", serviceCategory: "Decoration",
  description: "Event decoration services.", pricing: 1000, location: "Delhi", verificationStatus: "approved" });
const packageData = listing => ({ vendorId: listing._id, title: "Celebration", description: "Flowers and stage decoration.",
  serviceCategory: "Decoration", priceAmount: 150000, priceType: "starting", pricingUnit: "event", includedServices: ["Stage flowers"] });
const bookingData = listing => ({ vendorId: String(listing._id), eventType: "Wedding",
  eventDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  eventLocation: "Delhi hall", description: "A family celebration.", notes: "" });
const create = (customer, body, key = randomUUID()) => request(app).post("/api/bookings")
  .set("Authorization", auth(customer)).set("Idempotency-Key", key).send(body);
const update = (actor, id, status, admin = false) => request(app)
  .patch(admin ? `/api/admin/bookings/${id}` : `/api/bookings/${id}/status`)
  .set("Authorization", auth(actor)).send({ status });

before(async () => {
  process.env.JWT_SECRET = "package-booking-tests-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), VendorPackage.init(), Quotation.init(), Booking.init(), Availability.init(), NotificationOutbox.init()]);
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test("custom requests retain historical hashes and direct acceptance while package requests require customer agreement", async () => {
  const [customer, owner, admin] = await Promise.all([user("customer"), user("vendor"), user("admin")]);
  const listing = await profile(owner);
  const body = bookingData(listing);
  const custom = await create(customer, body);
  assert.equal(custom.status, 201, custom.body.message);
  const stored = await Booking.findById(custom.body.booking._id).select("+requestHash");
  const historicalHash = createHash("sha256").update(JSON.stringify([
    body.vendorId, body.eventType, body.eventDate, body.eventLocation, body.description, body.notes,
  ])).digest("hex");
  assert.equal(stored.requestHash, historicalHash);
  assert.equal((await update(owner, stored._id, "accepted")).status, 200);
  await update(customer, stored._id, "cancelled");

  const option = await VendorPackage.create(packageData(listing));
  const selected = await create(customer, { ...body, packageId: String(option._id), acceptedAgreement: { totalAmount: 1 } });
  assert.equal(selected.status, 201, selected.body.message);
  assert.equal(selected.body.booking.selectedPackage.packageId, String(option._id));
  assert.equal(selected.body.booking.acceptedAgreement, undefined);
  assert.equal(selected.body.booking.status, "pending");
  for (const [actor, adminRoute] of [[owner, false], [admin, false], [admin, true]])
    assert.equal((await update(actor, selected.body.booking._id, "accepted", adminRoute)).status, 409);
  assert.equal((await Booking.findById(selected.body.booking._id)).status, "pending");
});

test("request package snapshots survive edits/deactivation and idempotent replay remains recoverable", async () => {
  const [customer, owner] = await Promise.all([user("customer"), user("vendor")]);
  const listing = await profile(owner);
  const option = await VendorPackage.create(packageData(listing));
  const key = randomUUID();
  const body = { ...bookingData(listing), packageId: String(option._id) };
  const first = await create(customer, body, key);
  assert.equal(first.status, 201, first.body.message);
  const original = first.body.booking.selectedPackage;
  const edited = await request(app).patch(`/api/vendors/packages/${option._id}`).set("Authorization", auth(owner))
    .send({ revision: 1, title: "New title", priceAmount: 250000, active: false });
  assert.equal(edited.status, 200, edited.body.message);
  const replay = await create(customer, body, key);
  assert.equal(replay.status, 200, replay.body.message);
  assert.equal(replay.body.booking._id, first.body.booking._id);
  assert.deepEqual(replay.body.booking.selectedPackage, original);
  assert.equal((await create(customer, body)).status, 409);
  assert.equal(await Booking.countDocuments(), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
  const changedIntent = await create(customer, bookingData(listing), key);
  assert.equal(changedIntent.status, 409);
  assert.doesNotMatch(JSON.stringify(replay.body), /requestHash|idempotencyKeyHash|creationKeyHash|createdById/);
});

test("selection rejects foreign, inactive, mismatched and malformed packages without booking intent", async () => {
  const [customer, owner, otherOwner] = await Promise.all([user("customer"), user("vendor"), user("vendor")]);
  const [listing, foreign] = await Promise.all([profile(owner), profile(otherOwner)]);
  const foreignPackage = await VendorPackage.create(packageData(foreign));
  const inactive = await VendorPackage.create({ ...packageData(listing), active: false });
  const mismatched = await VendorPackage.create({ ...packageData(listing), serviceCategory: "DJ" });
  for (const [packageId, status] of [[String(foreignPackage._id), 404], [String(inactive._id), 409],
    [String(mismatched._id), 409], ["invalid", 400], [null, 400], [{ $ne: null }, 400]]) {
    const response = await create(customer, { ...bookingData(listing), packageId });
    assert.equal(response.status, status, response.body.message);
  }
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await NotificationOutbox.countDocuments(), 0);
});

test("package deactivation and selection serialize without selecting an already unavailable package", async () => {
  const [customer, owner] = await Promise.all([user("customer"), user("vendor")]);
  const listing = await profile(owner);
  const option = await VendorPackage.create(packageData(listing));
  const [selected, disabled] = await Promise.all([
    create(customer, { ...bookingData(listing), packageId: String(option._id) }),
    request(app).delete(`/api/vendors/packages/${option._id}`).set("Authorization", auth(owner)).send({ revision: 1 }),
  ]);
  assert.equal(disabled.status, 200, disabled.body.message);
  assert.ok([201, 409].includes(selected.status), selected.body.message);
  assert.equal(await Booking.countDocuments(), selected.status === 201 ? 1 : 0);
  assert.equal(await NotificationOutbox.countDocuments(), selected.status === 201 ? 1 : 0);
  assert.equal((await create(customer, { ...bookingData(listing), packageId: String(option._id) })).status, 409);
});

test("commercial snapshots are allowlisted and omitted for unrelated viewers", () => {
  const customerId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const source = {
    _id: new mongoose.Types.ObjectId(), status: "accepted", customerId: { _id: customerId, name: "Customer" },
    vendorId: { _id: new mongoose.Types.ObjectId(), userId: ownerId, businessName: "Vendor" },
    selectedPackage: { ...packageData({ _id: "unused" }), packageId: new mongoose.Types.ObjectId(), revision: 1, privateEmail: "PRIVATE_ACCOUNT_EMAIL" },
    quotationRevision: 2, quotationStatus: "accepted", acceptedAgreement: {
      quotationId: new mongoose.Types.ObjectId(), revision: 2, serviceDescription: "Decor",
      items: [{ description: "Flowers", quantity: 1, unitPriceAmount: 10000, email: "PRIVATE_ACCOUNT_EMAIL" }],
      additionalCharges: [], discountAmount: 0, subtotalAmount: 10000, totalAmount: 10000, currency: "INR",
      serviceDate: "2027-02-01", terms: "Agreed terms", acceptedAt: new Date(), expiresAt: new Date(),
      privateEmail: "PRIVATE_ACCOUNT_EMAIL", requestKeyHash: "PRIVATE_KEY_HASH",
    },
  };
  const customer = bookingView(source, { _id: customerId, role: "customer" });
  assert.equal(customer.acceptedAgreement.totalAmount, 10000);
  assert.equal(customer.selectedPackage.priceAmount, 150000);
  assert.doesNotMatch(JSON.stringify(customer), /PRIVATE_|requestKeyHash|privateEmail/);
  const outsider = bookingView(source, { _id: new mongoose.Types.ObjectId(), role: "customer" });
  assert.equal(outsider.selectedPackage, undefined);
  assert.equal(outsider.acceptedAgreement, undefined);
});
