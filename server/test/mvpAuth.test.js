import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { setAccountEmailSenderForTests } from "../src/services/accountEmailService.js";
import { hashToken } from "../src/utils/generateToken.js";

const password = "Planzo@Test123";
let mongo;
let outbox;

const userDetails = (overrides = {}) => ({
  name: "Planzo Customer", email: "customer@example.com", phone: "9876543210",
  password, role: "customer", ...overrides,
});

const authCookie = (response, name) => response.headers["set-cookie"].find((cookie) => cookie.startsWith(`${name}=`)).split(";")[0];
const emailToken = () => new URL(outbox.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");

async function signIn(details = {}) {
  const user = await User.create(userDetails(details));
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email: user.email, password });
  assert.equal(response.status, 200);
  return { agent, user, response };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "mvp-auth-test-secret-at-least-32-characters";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), RefreshToken.init(), Vendor.init(), Booking.init()]);
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  outbox = [];
  setAccountEmailSenderForTests(async (message) => { outbox.push(message); });
});

after(async () => {
  setAccountEmailSenderForTests(undefined);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("customer and vendor signup hash passwords, use HttpOnly cookies and reject admin role escalation", async () => {
  for (const role of ["customer", "vendor"]) {
    const response = await request(app).post("/api/auth/register").send(userDetails({ email: `${role}@example.com`, role }));
    assert.equal(response.status, 201);
    assert.equal(response.body.user.role, role);
    assert.equal(response.body.user.password, undefined);
    assert.equal(response.body.user.authVersion, undefined);
    assert.equal(response.body.token, undefined);
    assert.match(response.headers["set-cookie"].join(";"), /HttpOnly/);
    assert.ok(authCookie(response, "eventifyy_access"));
    assert.ok(authCookie(response, "eventifyy_refresh"));
    const stored = await User.findOne({ email: `${role}@example.com` }).select("+password");
    assert.notEqual(stored.password, password);
    assert.equal(await stored.comparePassword(password), true);
  }
  const denied = await request(app).post("/api/auth/register").send(userDetails({ role: "admin" }));
  assert.equal(denied.status, 400);
  const weak = await request(app).post("/api/auth/register").send(userDetails({ password: "weakpass" }));
  assert.equal(weak.status, 400);
  assert.equal(await User.countDocuments(), 2);
});

test("cookie refresh is single-use under concurrent requests and logout revokes the remaining refresh token", async () => {
  const { response } = await signIn();
  const oldRefresh = authCookie(response, "eventifyy_refresh");
  const responses = await Promise.all([
    request(app).post("/api/auth/refresh").set("Cookie", oldRefresh),
    request(app).post("/api/auth/refresh").set("Cookie", oldRefresh),
  ]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 401]);
  assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 1);
  const rotated = authCookie(responses.find((item) => item.status === 200), "eventifyy_refresh");
  const logout = await request(app).post("/api/auth/logout").set("Cookie", rotated);
  assert.equal(logout.status, 200);
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", rotated)).status, 401);
});

test("account recovery keeps responses generic and resets atomically once while revoking prior access and refresh", async () => {
  const { user, response } = await signIn();
  const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "unknown@example.com" });
  const forgot = await request(app).post("/api/auth/forgot-password").send({ email: user.email });
  assert.equal(forgot.status, 200);
  assert.deepEqual(forgot.body, unknown.body);
  assert.equal(forgot.body.resetToken, undefined);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, user.email);
  const token = emailToken();
  const stored = await User.findById(user._id).select("+passwordResetTokenHash +passwordResetExpiresAt");
  assert.equal(stored.passwordResetTokenHash, hashToken(token));
  assert.ok(stored.passwordResetExpiresAt > new Date());
  assert.equal(stored.toJSON().passwordResetTokenHash, undefined);
  const results = await Promise.all([
    request(app).post("/api/auth/reset-password").send({ token, password: "Next@Password123" }),
    request(app).post("/api/auth/reset-password").send({ token, password: "Next@Password123" }),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 400]);
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", authCookie(response, "eventifyy_access"))).status, 401);
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", authCookie(response, "eventifyy_refresh"))).status, 401);
  const fresh = request.agent(app);
  assert.equal((await fresh.post("/api/auth/login").send({ email: user.email, password: "Next@Password123" })).status, 200);
  // A new session must work even when issued during the same second as a password change.
  assert.equal((await fresh.get("/api/auth/me")).status, 200);
});

test("expired reset links fail without changing passwords and email failures leave no usable reset token", async () => {
  const { user } = await signIn();
  await request(app).post("/api/auth/forgot-password").send({ email: user.email });
  const token = emailToken();
  await User.updateOne({ _id: user._id }, { passwordResetExpiresAt: new Date(Date.now() - 1000) });
  assert.equal((await request(app).post("/api/auth/reset-password").send({ token, password: "Next@Password123" })).status, 400);
  setAccountEmailSenderForTests(async () => { throw new Error("SMTP unavailable"); });
  const failure = await request(app).post("/api/auth/forgot-password").send({ email: user.email });
  const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "unknown@example.com" });
  assert.deepEqual(failure.body, unknown.body);
  assert.equal((await User.findById(user._id).select("+passwordResetTokenHash")).passwordResetTokenHash, undefined);
});

test("profile updates cannot bypass verified email changes or change roles", async () => {
  const { agent, user } = await signIn();
  const changed = await agent.patch("/api/auth/profile").send({ name: "New Name", phone: "9876543211", email: "new@example.com", role: "admin" });
  assert.equal(changed.status, 400);
  assert.equal((await User.findById(user._id)).email, user.email);
  const profile = await agent.patch("/api/auth/profile").send({ name: "New Name", phone: "9876543211", role: "admin" });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.name, "New Name");
  assert.equal(profile.body.user.role, "customer");
  assert.equal((await agent.get("/api/admin/users")).status, 403);
  assert.equal((await request(app).get("/api/admin/users")).status, 401);
});

test("email change requires a current password, verifies the new address once and invalidates existing sessions", async () => {
  const { agent, user, response } = await signIn();
  const body = { email: "new@example.com", currentPassword: password };
  assert.equal((await request(app).post("/api/auth/email-change").send(body)).status, 401);
  assert.equal((await agent.post("/api/auth/email-change").send({ ...body, currentPassword: "Wrong@Password123" })).status, 401);
  const change = await agent.post("/api/auth/email-change").send(body);
  assert.equal(change.status, 200);
  assert.equal(change.body.token, undefined);
  assert.equal(outbox[0].to, "new@example.com");
  assert.equal((await User.findById(user._id)).email, user.email);
  const token = emailToken();
  const stored = await User.findById(user._id).select("+pendingEmail +emailChangeTokenHash");
  assert.equal(stored.emailChangeTokenHash, hashToken(token));
  assert.equal(stored.pendingEmail, "new@example.com");
  assert.equal(stored.toJSON().pendingEmail, undefined);
  assert.equal((await request(app).post("/api/auth/email-change/confirm").send({ token })).status, 200);
  assert.equal((await User.findById(user._id)).email, "new@example.com");
  assert.equal((await request(app).post("/api/auth/email-change/confirm").send({ token })).status, 400);
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", authCookie(response, "eventifyy_access"))).status, 401);
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", authCookie(response, "eventifyy_refresh"))).status, 401);
  assert.equal((await request(app).post("/api/auth/login").send({ email: user.email, password })).status, 401);
  const fresh = request.agent(app);
  assert.equal((await fresh.post("/api/auth/login").send({ email: "new@example.com", password })).status, 200);
  assert.equal((await fresh.get("/api/auth/me")).status, 200);
});

test("email confirmation rejects expired links and address collisions while preserving the current address", async () => {
  const { agent, user } = await signIn();
  await agent.post("/api/auth/email-change").send({ email: "new@example.com", currentPassword: password });
  const expired = emailToken();
  await User.updateOne({ _id: user._id }, { emailChangeExpiresAt: new Date(Date.now() - 1000) });
  assert.equal((await request(app).post("/api/auth/email-change/confirm").send({ token: expired })).status, 400);
  await agent.post("/api/auth/email-change").send({ email: "new@example.com", currentPassword: password });
  const token = emailToken();
  await User.create(userDetails({ email: "new@example.com" }));
  assert.equal((await request(app).post("/api/auth/email-change/confirm").send({ token })).status, 409);
  assert.equal((await User.findById(user._id)).email, user.email);
});

test("password changes require the current password and invalidate pending email verification", async () => {
  const { agent, user } = await signIn();
  await agent.post("/api/auth/email-change").send({ email: "new@example.com", currentPassword: password });
  const token = emailToken();
  assert.equal((await agent.patch("/api/auth/password").send({ currentPassword: "Wrong@Password123", newPassword: "Next@Password123" })).status, 401);
  assert.equal((await agent.patch("/api/auth/password").send({ currentPassword: password, newPassword: "Next@Password123" })).status, 200);
  assert.equal((await request(app).post("/api/auth/email-change/confirm").send({ token })).status, 400);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  assert.equal((await User.findById(user._id)).email, user.email);
});

test("suspended and deactivated users cannot authenticate through login, access cookies or refresh", async () => {
  for (const state of [{ suspendedAt: new Date() }, { accountStatus: "deactivated" }]) {
    const { agent, user } = await signIn({ email: `state${outbox.length}${Object.keys(state)[0]}@example.com` });
    await User.updateOne({ _id: user._id }, state);
    assert.equal((await agent.get("/api/auth/me")).status, 403);
    assert.equal((await agent.post("/api/auth/refresh")).status, 403);
    assert.equal(await RefreshToken.countDocuments({ userId: user._id, revokedAt: null }), 0);
    assert.equal((await request(app).post("/api/auth/login").send({ email: user.email, password })).status, 403);
    await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    assert.equal(outbox.length, 0);
  }
});

test("deactivation guards active bookings and retains account and completed booking history", async () => {
  const { agent, user } = await signIn();
  const booking = await Booking.collection.insertOne({
    customerId: user._id, vendorId: new mongoose.Types.ObjectId(), eventType: "Wedding",
    eventDate: new Date("2030-12-01"), eventLocation: "Mumbai", status: "accepted",
  });
  assert.equal((await agent.delete("/api/auth/account").send({ password })).status, 409);
  await Booking.collection.updateOne({ _id: booking.insertedId }, { $set: { status: "completed" } });
  assert.equal((await agent.delete("/api/auth/account").send({ password: "Wrong@Password123" })).status, 401);
  assert.equal((await agent.delete("/api/auth/account").send({ password })).status, 200);
  assert.equal((await User.findById(user._id)).accountStatus, "deactivated");
  assert.ok(await Booking.findById(booking.insertedId));
  assert.equal((await request(app).post("/api/auth/login").send({ email: user.email, password })).status, 403);
});

test("vendor deactivation preserves legacy approvals and profile references while guarding received requests", async () => {
  const { agent, user } = await signIn({ role: "vendor" });
  const result = await Vendor.collection.insertOne({
    userId: user._id, businessName: "Legacy Caterer", serviceCategory: "Catering",
    description: "Existing vendor profile", pricing: 1000, location: "Mumbai", verified: true,
  });
  const received = await Booking.collection.insertOne({
    customerId: new mongoose.Types.ObjectId(), vendorId: result.insertedId,
    eventDate: new Date("2030-12-01"), eventType: "Wedding", eventLocation: "Mumbai", status: "pending",
  });
  assert.equal((await agent.delete("/api/auth/account").send({ password })).status, 409);
  await Booking.collection.updateOne({ _id: received.insertedId }, { $set: { status: "rejected" } });
  assert.equal((await agent.delete("/api/auth/account").send({ password })).status, 200);
  const profile = await Vendor.findById(result.insertedId);
  assert.ok(profile);
  assert.equal(profile.verified, true);
  assert.equal(profile.verificationStatus, "approved");
  assert.equal(profile.suspended, true);
  assert.ok(await Booking.findById(received.insertedId));
});
