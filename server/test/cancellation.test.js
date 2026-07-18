import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import CancellationRequest from "../src/models/CancellationRequest.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { calculateCancellation } from "../src/services/payments/cancellationPolicyService.js";

let mongo; const password = "Planzo@123";
before(async () => { process.env.JWT_SECRET = "cancellation-test"; mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([User.syncIndexes(), Vendor.syncIndexes(), Booking.syncIndexes(), CancellationRequest.syncIndexes()]); });
beforeEach(async () => Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))));
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function setup() {
  const [customer, vendorUser, admin] = await User.create([
    { name: "Customer", email: "cancel-customer@example.com", phone: "9777777701", password, role: "customer" },
    { name: "Vendor", email: "cancel-vendor@example.com", phone: "9777777702", password, role: "vendor" },
    { name: "Admin", email: "cancel-admin@example.com", phone: "9777777703", password, role: "admin" },
  ]);
  const vendor = await Vendor.create({ userId: vendorUser._id, businessName: "Cancel Events", serviceCategory: "Event Planner", description: "Events", pricing: 100000, location: "Delhi" });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding", eventDate: new Date("2030-12-20"), eventDateOnly: "2030-12-20", eventStartTime: "12:00", eventEndTime: "18:00", eventLocation: "Delhi", budget: 100000, totalAmount: 100000, totalPaidAmount: 0, status: "accepted" });
  const login = async (email) => { const agent = request.agent(app); await agent.post("/api/auth/login").send({ email, password }); return agent; };
  return { booking, customerAgent: await login(customer.email), vendorAgent: await login(vendorUser.email), adminAgent: await login(admin.email) };
}

test("policy produces full, partial, and no refund windows", () => {
  const booking = { eventDateOnly: "2026-07-20", eventStartTime: "12:00", totalPaidAmount: 100000, totalAmount: 100000 };
  assert.equal(calculateCancellation(booking, new Date("2026-07-16T00:00:00Z"), "customer").policyOutcome, "full_refund");
  assert.equal(calculateCancellation(booking, new Date("2026-07-18T06:30:00Z"), "customer").policyOutcome, "partial_refund");
  assert.equal(calculateCancellation(booking, new Date("2026-07-20T07:00:00Z"), "customer").policyOutcome, "no_refund");
  assert.equal(calculateCancellation(booking, new Date("2026-07-20T07:00:00Z"), "vendor").refundPercentage, 100);
});

test("customer cancellation requires reason and stores actor, timeline, and policy", async () => {
  const { booking, customerAgent } = await setup();
  assert.equal((await customerAgent.post(`/api/bookings/${booking._id}/cancel`).send({})).status, 400);
  const response = await customerAgent.post(`/api/bookings/${booking._id}/cancel`).send({ reason: "Event postponed" });
  assert.equal(response.status, 201); assert.equal(response.body.booking.status, "cancelled"); assert.equal(response.body.booking.cancelledByRole, "customer"); assert.equal(response.body.cancellation.policyOutcome, "no_refund"); assert.equal(response.body.cancellation.timeline.length, 1);
});

test("vendor cancellation grants full eligible refund and admin can reject request", async () => {
  const { booking, vendorAgent, adminAgent } = await setup();
  booking.totalPaidAmount = 50000; await booking.save();
  const cancelled = await vendorAgent.post(`/api/bookings/${booking._id}/cancel`).send({ reason: "Vendor unavailable" });
  assert.equal(cancelled.status, 201); assert.equal(cancelled.body.cancellation.refundAmount, 50000); assert.equal(cancelled.body.cancellation.refundStatus, "pending_review");
  const reviewed = await adminAgent.patch(`/api/admin/cancellations/${cancelled.body.cancellation._id}/refund`).send({ decision: "reject", reason: "Payment evidence disputed" });
  assert.equal(reviewed.status, 200); assert.equal(reviewed.body.cancellation.refundStatus, "rejected"); assert.ok(reviewed.body.cancellation.reviewedAt);
});

test("customer can dispute a rejected refund", async () => {
  const { booking, customerAgent, adminAgent } = await setup(); booking.totalPaidAmount = 50000; await booking.save();
  const cancelled = await customerAgent.post(`/api/bookings/${booking._id}/cancel`).send({ reason: "Plans changed" });
  await adminAgent.patch(`/api/admin/cancellations/${cancelled.body.cancellation._id}/refund`).send({ decision: "reject", reason: "Outside policy" });
  const disputed = await customerAgent.post(`/api/bookings/${booking._id}/cancellation/dispute`).send({ reason: "Medical emergency" });
  assert.equal(disputed.status, 200); assert.equal(disputed.body.cancellation.refundStatus, "disputed");
});
