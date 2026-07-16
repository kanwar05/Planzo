import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import VendorVerification from "../src/models/VendorVerification.js";

let mongo;
const password = "Planzo@123";
before(async () => { process.env.JWT_SECRET = "verification-module-secret"; mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([User.syncIndexes(), Vendor.syncIndexes(), VendorVerification.syncIndexes()]); });
beforeEach(async () => Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))));
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function setup() {
  const [vendorUser, admin] = await User.create([
    { name: "Vendor", email: "vendor-module@example.com", phone: "9888888881", password, role: "vendor" },
    { name: "Admin", email: "admin-module@example.com", phone: "9888888882", password, role: "admin" },
  ]);
  const vendor = await Vendor.create({ userId: vendorUser._id, businessName: "Verified Events", serviceCategory: "Event Planner", description: "Planning", pricing: 1000, location: "Delhi" });
  const vendorAgent = request.agent(app); const adminAgent = request.agent(app);
  await vendorAgent.post("/api/auth/login").send({ email: vendorUser.email, password });
  await adminAgent.post("/api/auth/login").send({ email: admin.email, password });
  return { vendorUser, admin, vendor, vendorAgent, adminAgent };
}

test("vendor can view an empty verification state", async () => {
  const { vendorAgent } = await setup(); const response = await vendorAgent.get("/api/vendor/verification/me");
  assert.equal(response.status, 200); assert.equal(response.body.verification, null);
});

test("admin review requires a reason and records reviewer history", async () => {
  const { vendorUser, admin, vendor, adminAgent } = await setup();
  const doc = (name) => ({ url: `https://res.cloudinary.com/demo/${name}.jpg`, publicId: name, originalName: `${name}.jpg`, mimeType: "image/jpeg", size: 1234 });
  const verification = await VendorVerification.create({ vendor: vendor._id, status: "pending", submittedAt: new Date(), documents: { governmentId: doc("government"), businessLicense: doc("license"), panCard: doc("pan"), profilePhoto: doc("photo") }, verificationHistory: [{ status: "pending", reason: "Documents submitted", changedBy: vendorUser._id }] });
  const invalid = await adminAgent.patch(`/api/admin/verifications/${verification._id}/review`).send({ status: "needs_resubmission" });
  assert.equal(invalid.status, 400);
  const response = await adminAgent.patch(`/api/admin/verifications/${verification._id}/review`).send({ status: "needs_resubmission", reason: "PAN card is blurry." });
  assert.equal(response.status, 200); assert.equal(response.body.verification.status, "needs_resubmission"); assert.equal(String(response.body.verification.reviewedBy), String(admin._id)); assert.equal(response.body.verification.verificationHistory.at(-1).reason, "PAN card is blurry.");
  const updatedVendor = await Vendor.findById(vendor._id); assert.equal(updatedVendor.verified, false); assert.equal(updatedVendor.verificationRejectionReason, "PAN card is blurry.");
});

test("non-admin cannot access the verification review queue", async () => {
  const { vendorAgent } = await setup(); const response = await vendorAgent.get("/api/admin/verifications"); assert.equal(response.status, 403);
});
