import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";

let mongo;

const strongPassword = "Planzo@123";

before(async () => {
  process.env.JWT_SECRET = "auth-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), Vendor.syncIndexes()]);
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("admin rejection reason and vendor resubmission reset verification state", async () => {
  await User.create([
    {
      name: "Vendor One",
      email: "vendor@example.com",
      phone: "9999999991",
      password: strongPassword,
      role: "vendor",
    },
    {
      name: "Admin One",
      email: "admin@example.com",
      phone: "9999999992",
      password: strongPassword,
      role: "admin",
    },
  ]);

  const vendorAgent = request.agent(app);
  await vendorAgent.post("/api/auth/login").send({
    email: "vendor@example.com",
    password: strongPassword,
  });

  const vendorProfileResponse = await vendorAgent.post("/api/vendors/profile").send({
    businessName: "Event Studio",
    serviceCategory: "Decoration",
    description: "Creative wedding decor",
    pricing: 12000,
    location: "Mumbai",
  });
  assert.equal(vendorProfileResponse.status, 201);

  const adminAgent = request.agent(app);
  await adminAgent.post("/api/auth/login").send({
    email: "admin@example.com",
    password: strongPassword,
  });

  const verifyWithoutDocumentsResponse = await adminAgent.patch(
    `/api/admin/vendors/${vendorProfileResponse.body.vendor._id}/verify`,
  );

  assert.equal(verifyWithoutDocumentsResponse.status, 400);
  assert.match(
    verifyWithoutDocumentsResponse.body.message,
    /submit verification documents/i,
  );

  const rejectResponse = await adminAgent
    .patch(`/api/admin/vendors/${vendorProfileResponse.body.vendor._id}/reject`)
    .send({ reason: "Documents are blurry." });

  assert.equal(rejectResponse.status, 200);
  assert.equal(rejectResponse.body.vendor.verificationStatus, "rejected");
  assert.equal(rejectResponse.body.vendor.verificationRejectionReason, "Documents are blurry.");

  const vendorProfileAfterReject = await Vendor.findById(vendorProfileResponse.body.vendor._id);
  assert.equal(vendorProfileAfterReject.verificationStatus, "rejected");
  assert.equal(vendorProfileAfterReject.verificationRejectionReason, "Documents are blurry.");

  const resubmitResponse = await vendorAgent.post("/api/vendors/verification-documents").send({
    documents: [
      {
        url: "https://example.com/id.pdf",
        publicId: "",
        originalName: "id.pdf",
        mimeType: "application/pdf",
      },
    ],
  });

  assert.equal(resubmitResponse.status, 200);
  assert.equal(resubmitResponse.body.vendor.verificationStatus, "pending");
  assert.equal(resubmitResponse.body.vendor.verificationRejectionReason, "");

  const approveAfterResubmissionResponse = await adminAgent.patch(
    `/api/admin/vendors/${vendorProfileResponse.body.vendor._id}/verify`,
  );

  assert.equal(approveAfterResubmissionResponse.status, 200);
  assert.equal(approveAfterResubmissionResponse.body.vendor.verificationStatus, "approved");
  assert.equal(approveAfterResubmissionResponse.body.vendor.verified, true);
});
