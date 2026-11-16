import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import packageRoutes from "../src/routes/packageRoutes.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import VendorPackage from "../src/models/VendorPackage.js";
import { getSelectablePackage, packageSnapshot, packageView } from "../src/services/packageService.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

const app = express();
app.use(express.json());
app.use("/api/vendors", packageRoutes);
app.use(errorHandler);
let mongo;
let sequence = 0;
const auth = user => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
const newUser = (role = "vendor", verified = true) => User.create({
  name: `Package owner ${++sequence}`, email: `package-private-${sequence}@example.test`,
  phone: "9876543210", password: "PackageSecure123!", role,
  emailVerifiedAt: verified ? new Date() : null,
});
const listing = (owner, extra = {}) => Vendor.create({
  userId: owner._id, businessName: "Package Events", serviceCategory: "Decoration",
  description: "Thoughtful event decoration.", pricing: 10000, location: "Delhi",
  verificationStatus: "approved", ...extra,
});
const payload = (extra = {}) => ({
  title: "Celebration styling", description: "A complete styling service for your celebration.",
  serviceCategory: "Decoration", priceAmount: 1_250_050, priceType: "starting", pricingUnit: "event",
  includedServices: ["Floral backdrop", "Setup and cleanup"], exclusions: ["Venue hire"],
  addOns: [{ title: "Extra arrangements", priceAmount: 25000, pricingUnit: "item" }],
  maxDurationMinutes: 480, maxQuantity: 100, ...extra,
});
const create = (owner, body = payload(), key) => {
  const operation = request(app).post("/api/vendors/packages").set("Authorization", auth(owner));
  return (key ? operation.set("Idempotency-Key", key) : operation).send(body);
};
const edit = (owner, id, body) => request(app).patch(`/api/vendors/packages/${id}`).set("Authorization", auth(owner)).send(body);
const ownList = owner => request(app).get("/api/vendors/packages/mine").set("Authorization", auth(owner));
const publicList = vendor => request(app).get(`/api/vendors/${vendor._id}/packages`);

before(async () => {
  process.env.JWT_SECRET = "package-tests-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), VendorPackage.init()]);
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("verified vendors create, edit and deactivate structured packages without exposing private state", async () => {
  const owner = await newUser();
  const vendor = await listing(owner);
  const created = await create(owner);
  assert.equal(created.status, 201, created.body.message);
  const item = created.body.package;
  assert.equal(item.priceAmount, 1_250_050);
  assert.equal(item.currency, "INR");
  assert.equal(item.vendorId, String(vendor._id));
  assert.equal(item.revision, 1);
  assert.equal(item.active, true);
  assert.deepEqual(item.includedServices, payload().includedServices);
  assert.deepEqual(item.addOns, payload().addOns);
  assert.doesNotMatch(JSON.stringify(item), /package-private|9876543210|password|bookingRevision|creationKey|creationRequest/);
  assert.equal((await publicList(vendor)).body.packages.length, 1);
  const updated = await edit(owner, item._id, { revision: 1, title: "Updated styling", priceType: "fixed", priceAmount: 1_500_000 });
  assert.equal(updated.status, 200, updated.body.message);
  assert.equal(updated.body.package.revision, 2);
  assert.equal(updated.body.package.priceType, "fixed");
  const deactivated = await request(app).delete(`/api/vendors/packages/${item._id}`).set("Authorization", auth(owner)).send({ revision: 2 });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.package.active, false);
  assert.equal(deactivated.body.package.revision, 3);
  assert.equal(await VendorPackage.countDocuments(), 1);
  assert.equal((await publicList(vendor)).body.packages.length, 0);
  assert.equal((await ownList(owner)).body.packages.length, 1);
  assert.equal((await edit(owner, item._id, { revision: 3, active: true })).status, 200);
});

test("public packages require approved active vendor ownership and omit inactive/category-stale entries", async () => {
  const owner = await newUser();
  const vendor = await listing(owner, { verificationStatus: "pending" });
  const created = await create(owner);
  assert.equal(created.status, 201, "pending profile owners may prepare their packages");
  assert.equal((await publicList(vendor)).status, 404);
  await Vendor.updateOne({ _id: vendor._id }, { $set: { verificationStatus: "approved" } });
  assert.equal((await publicList(vendor)).body.packages.length, 1);
  await User.updateOne({ _id: owner._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await publicList(vendor)).status, 404);
  await User.updateOne({ _id: owner._id }, { $set: { suspendedAt: null } });
  await Vendor.updateOne({ _id: vendor._id }, { $set: { serviceCategory: "Catering" } });
  assert.deepEqual((await publicList(vendor)).body.packages, []);
  const denied = await edit(owner, created.body.package._id, { revision: 1, active: true });
  assert.equal(denied.status, 409);
  assert.equal((await edit(owner, created.body.package._id, { revision: 1, serviceCategory: "Catering", active: true })).status, 200);
});

test("write permissions reject guests, customers, unverified accounts and other vendors", async () => {
  const [owner, other, customer, unverified] = await Promise.all([newUser(), newUser(), newUser("customer"), newUser("vendor", false)]);
  await Promise.all([listing(owner), listing(other), listing(unverified)]);
  const created = await create(owner);
  const id = created.body.package._id;
  assert.equal((await request(app).post("/api/vendors/packages").send(payload())).status, 401);
  assert.equal((await create(customer)).status, 403);
  const denied = await create(unverified);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal((await edit(other, id, { revision: 1, title: "Foreign edit" })).status, 404);
  assert.equal((await request(app).delete(`/api/vendors/packages/${id}`).set("Authorization", auth(other)).send({ revision: 1 })).status, 404);
  assert.deepEqual((await ownList(other)).body.packages, []);
  assert.equal((await VendorPackage.findById(id)).title, payload().title);
});

test("package validation rejects invalid money, quantities, category, nested values and untrusted fields", async () => {
  const owner = await newUser();
  await listing(owner);
  const invalid = [
    { priceAmount: -1 }, { priceAmount: 1.5 }, { priceAmount: "10000" }, { priceAmount: 100_000_000_001 },
    { maxDurationMinutes: 0 }, { maxDurationMinutes: 525601 }, { maxQuantity: 1.5 }, { maxQuantity: 1_000_001 },
    { priceType: "hourly" }, { pricingUnit: "unknown" }, { active: "true" }, { currency: "USD" },
    { title: " " }, { title: "x".repeat(121) }, { description: {} }, { serviceCategory: "Catering" },
    { includedServices: [] }, { includedServices: [{ email: "private" }] }, { exclusions: "none" },
    { addOns: [{ title: "Extra", priceAmount: 1.5, pricingUnit: "item" }] },
    { addOns: [{ title: "Extra", priceAmount: 1, pricingUnit: "item", private: "not allowed" }] },
    { vendorId: String(new mongoose.Types.ObjectId()) }, { creationKeyHash: "client controlled" },
  ];
  for (const extra of invalid) {
    const response = await create(owner, payload(extra));
    assert.equal(response.status, 400, `${JSON.stringify(extra)}: ${response.body.message}`);
  }
  assert.equal(await VendorPackage.countDocuments(), 0);
  const zero = await create(owner, payload({ priceAmount: 0, maxDurationMinutes: null, maxQuantity: null }));
  assert.equal(zero.status, 201);
  assert.equal(zero.body.package.priceAmount, 0);
  assert.equal(zero.body.package.maxQuantity, null);
});

test("stale and simultaneous package updates use compare-and-set revisions", async () => {
  const owner = await newUser();
  await listing(owner);
  const id = (await create(owner)).body.package._id;
  for (const revision of [undefined, null, "1", 0, 1.5])
    assert.equal((await edit(owner, id, { revision, title: "Invalid revision" })).status, 400);
  const responses = await Promise.all([
    edit(owner, id, { revision: 1, title: "First edit" }), edit(owner, id, { revision: 1, title: "Second edit" }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await VendorPackage.findById(id)).revision, 2);
  const staleDelete = await request(app).delete(`/api/vendors/packages/${id}`).set("Authorization", auth(owner)).send({ revision: 1 });
  assert.equal(staleDelete.status, 409);
  assert.equal((await VendorPackage.findById(id)).active, true);
});

test("duplicate package creates replay once and key conflicts never create a second package", async () => {
  const owner = await newUser();
  const vendor = await listing(owner);
  const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 4 }, () => create(owner, payload(), key)));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 200).length, 3,
    responses.map(response => `${response.status}: ${response.body.message}`).join("; "));
  assert.equal(new Set(responses.map(response => response.body.package._id)).size, 1);
  assert.equal(await VendorPackage.countDocuments(), 1);
  assert.equal((await create(owner, payload({ priceAmount: 10 }), key)).status, 409);
  await Vendor.updateOne({ _id: vendor._id }, { $set: { serviceCategory: "Catering" } });
  assert.equal((await create(owner, payload(), key)).status, 200, "committed intent replays after vendor category changes");
  assert.doesNotMatch(JSON.stringify(responses[0].body), /creationKeyHash|creationRequestHash/);
});

test("selection rejects inactive, foreign and category-stale packages and snapshots stay independent of edits", async () => {
  const [owner, other] = await Promise.all([newUser(), newUser()]);
  const [vendor, otherVendor] = await Promise.all([listing(owner), listing(other)]);
  const id = (await create(owner)).body.package._id;
  const item = await getSelectablePackage(id, vendor);
  const snapshot = packageSnapshot(item);
  assert.equal(snapshot.packageId, id);
  assert.equal(snapshot.priceAmount, payload().priceAmount);
  assert.equal(snapshot.vendorId, undefined);
  assert.equal(snapshot.active, undefined);
  assert.equal((await edit(owner, id, { revision: 1, priceAmount: 999, includedServices: ["Changed services"] })).status, 200);
  assert.equal(snapshot.priceAmount, payload().priceAmount);
  assert.deepEqual(snapshot.includedServices, payload().includedServices);
  await assert.rejects(getSelectablePackage(id, otherVendor), { statusCode: 404 });
  await assert.rejects(getSelectablePackage("invalid", vendor), { statusCode: 400 });
  await VendorPackage.updateOne({ _id: id }, { $set: { active: false } });
  await assert.rejects(getSelectablePackage(id, vendor), { statusCode: 409 });
  const view = packageView({ ...item.toObject(), contactDetails: { email: "PRIVATE_EMAIL" }, title: { email: "PRIVATE_NESTED" }, addOns: [{ title: "Safe", priceAmount: 100, pricingUnit: "item", email: "PRIVATE_EMAIL" }] });
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE_/);
});

test("package cap bounds management and public listing results", async () => {
  const owner = await newUser();
  const vendor = await listing(owner);
  await VendorPackage.insertMany(Array.from({ length: 100 }, (_, index) => ({ ...payload(), title: `Package ${index}`, vendorId: vendor._id })));
  assert.equal((await ownList(owner)).body.packages.length, 100);
  assert.equal((await publicList(vendor)).body.packages.length, 100);
  assert.equal((await create(owner)).status, 409);
});

test("credential changes between authentication and the transaction fence package creation and edits", async () => {
  for (const mode of ["create", "edit"]) {
    const owner = await newUser();
    const vendor = await listing(owner);
    const existing = mode === "edit" ? (await create(owner)).body.package : null;
    const before = existing ? await VendorPackage.findById(existing._id).lean() : null;
    const beforeVendor = await Vendor.findById(vendor._id).select("+bookingRevision");
    const beforeAccount = await User.findById(owner._id).select("+bookingGuardRevision");
    const original = User.findOneAndUpdate;
    let changed = false;
    const hooked = mock.method(User, "findOneAndUpdate", async function (...args) {
      if (!changed && args[1]?.$inc?.bookingGuardRevision === 1) {
        changed = true;
        // The request has already passed protect() with the old access token.
        await User.collection.updateOne({ _id: owner._id }, { $inc: { authVersion: 1 } });
      }
      return original.apply(this, args);
    });
    try {
      const response = mode === "create" ? await create(owner)
        : await edit(owner, existing._id, { revision: 1, title: "Stale authenticated edit" });
      assert.equal(response.status, 401, response.body.message);
      assert.equal(changed, true);
      assert.equal(await VendorPackage.countDocuments({ vendorId: vendor._id }), existing ? 1 : 0);
      if (existing) assert.deepEqual(await VendorPackage.findById(existing._id).lean(), before);
      assert.equal((await Vendor.findById(vendor._id).select("+bookingRevision")).bookingRevision, beforeVendor.bookingRevision);
      assert.equal((await User.findById(owner._id).select("+bookingGuardRevision")).bookingGuardRevision, beforeAccount.bookingGuardRevision);
    } finally {
      hooked.mock.restore();
    }
  }
});
