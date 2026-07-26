import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import AuditLog from "../src/models/AuditLog.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";

let mongo;
const password = "Planzo@123";

before(async () => {
  process.env.JWT_SECRET = "audit-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), AuditLog.syncIndexes(), RefreshToken.syncIndexes()]);
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});
after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function setup() {
  const [admin, customer] = await User.create([
    { name: "Audit Admin", email: "admin@planzo.test", phone: "9999999991", password, role: "admin" },
    { name: "Audit Customer", email: "customer@planzo.test", phone: "9999999992", password, role: "customer" },
  ]);
  const adminAgent = request.agent(app);
  await adminAgent.post("/api/auth/login").set("user-agent", "Mozilla/5.0 Chrome/120").send({ email: admin.email, password });
  return { admin, customer, adminAgent };
}

test("successful login records actor, timestamp, IP, and browser", async () => {
  const { admin } = await setup();
  const log = await AuditLog.findOne({ action: "login", actor: admin._id });
  assert.ok(log);
  assert.ok(log.createdAt);
  assert.equal(log.browser, "Chrome");
  assert.equal(log.newValue.status, "success");
});

test("admin suspension and role changes preserve old/new values and reason", async () => {
  const { customer, adminAgent } = await setup();
  const suspension = await adminAgent
    .patch(`/api/admin/users/${customer._id}/suspension`)
    .send({ suspended: true, reason: "Repeated marketplace abuse." });
  assert.equal(suspension.status, 200);

  const role = await adminAgent
    .patch(`/api/admin/users/${customer._id}/role`)
    .send({ role: "vendor", reason: "Vendor onboarding approved." });
  assert.equal(role.status, 200);

  const logs = await AuditLog.find({ targetId: customer._id }).sort({ createdAt: 1 });
  assert.deepEqual(logs.map((log) => log.action), ["user_suspended", "role_changed"]);
  assert.equal(logs[0].reason, "Repeated marketplace abuse.");
  assert.equal(logs[1].oldValue.role, "customer");
  assert.equal(logs[1].newValue.role, "vendor");
});

test("audit endpoint is admin-only and supports search and action filters", async () => {
  const { customer, adminAgent } = await setup();
  await adminAgent.patch(`/api/admin/users/${customer._id}/suspension`).send({
    suspended: true, reason: "Security investigation",
  });

  const filtered = await adminAgent.get("/api/admin/audit-logs").query({
    action: "user_suspended", search: "investigation",
  });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.logs.length, 1);
  assert.equal(filtered.body.logs[0].targetLabel, "customer@planzo.test");

  const customerAgent = request.agent(app);
  const unsuspended = await User.findById(customer._id);
  unsuspended.suspendedAt = null;
  unsuspended.suspensionReason = "";
  await unsuspended.save({ validateBeforeSave: false });
  await customerAgent.post("/api/auth/login").send({ email: customer.email, password });
  const forbidden = await customerAgent.get("/api/admin/audit-logs");
  assert.equal(forbidden.status, 403);
});
