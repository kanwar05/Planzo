import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";

let mongo;

const strongPassword = "Planzo@123";

before(async () => {
  process.env.JWT_SECRET = "auth-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes()]);
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

test("register creates HttpOnly auth cookies and does not return JWTs", async () => {
  const response = await request(app).post("/api/auth/register").send({
    name: "Customer One",
    email: "customer@example.com",
    phone: "9999999991",
    password: strongPassword,
    role: "customer",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.token, undefined);
  assert.equal(response.body.user.email, "customer@example.com");
  assert.match(response.headers["set-cookie"].join(";"), /planzo_access=/);
  assert.match(response.headers["set-cookie"].join(";"), /planzo_refresh=/);
  assert.match(response.headers["set-cookie"].join(";"), /HttpOnly/);
});

test("register rejects weak passwords", async () => {
  const response = await request(app).post("/api/auth/register").send({
    name: "Customer One",
    email: "customer@example.com",
    phone: "9999999991",
    password: "secret123",
    role: "customer",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /uppercase/i);
});

test("login, refresh, and logout manage cookie sessions", async () => {
  await User.create({
    name: "Customer One",
    email: "customer@example.com",
    phone: "9999999991",
    password: strongPassword,
    role: "customer",
  });

  const agent = request.agent(app);

  const loginResponse = await agent.post("/api/auth/login").send({
    email: "customer@example.com",
    password: strongPassword,
  });
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.token, undefined);

  const meResponse = await agent.get("/api/auth/me");
  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.body.user.email, "customer@example.com");

  const refreshResponse = await agent.post("/api/auth/refresh");
  assert.equal(refreshResponse.status, 200);
  assert.equal(refreshResponse.body.user.email, "customer@example.com");

  const activeTokenCount = await RefreshToken.countDocuments({
    revokedAt: null,
  });
  assert.equal(activeTokenCount, 1);

  const logoutResponse = await agent.post("/api/auth/logout");
  assert.equal(logoutResponse.status, 200);

  const afterLogoutResponse = await agent.post("/api/auth/refresh");
  assert.equal(afterLogoutResponse.status, 401);
});

test("profile update validates and returns the updated user", async () => {
  await User.create([
    {
      name: "Customer One",
      email: "customer@example.com",
      phone: "9999999991",
      password: strongPassword,
      role: "customer",
    },
    {
      name: "Customer Two",
      email: "taken@example.com",
      phone: "9999999992",
      password: strongPassword,
      role: "customer",
    },
  ]);

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({
    email: "customer@example.com",
    password: strongPassword,
  });

  const updateResponse = await agent.patch("/api/auth/profile").send({
    name: "Updated Customer",
    email: "updated@example.com",
    phone: "9999999999",
  });
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.user.name, "Updated Customer");
  assert.equal(updateResponse.body.user.email, "updated@example.com");

  const duplicateResponse = await agent.patch("/api/auth/profile").send({
    name: "Updated Customer",
    email: "taken@example.com",
    phone: "9999999999",
  });
  assert.equal(duplicateResponse.status, 409);
});

test("password change requires current password and invalidates session", async () => {
  await User.create({
    name: "Customer One",
    email: "customer@example.com",
    phone: "9999999991",
    password: strongPassword,
    role: "customer",
  });

  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({
    email: "customer@example.com",
    password: strongPassword,
  });

  const wrongPasswordResponse = await agent.patch("/api/auth/password").send({
    currentPassword: "Wrong@123",
    newPassword: "NextPass@123",
  });
  assert.equal(wrongPasswordResponse.status, 401);

  const changeResponse = await agent.patch("/api/auth/password").send({
    currentPassword: strongPassword,
    newPassword: "NextPass@123",
  });
  assert.equal(changeResponse.status, 200);

  const oldSessionResponse = await agent.get("/api/auth/me");
  assert.equal(oldSessionResponse.status, 401);

  const newLoginResponse = await request(app).post("/api/auth/login").send({
    email: "customer@example.com",
    password: "NextPass@123",
  });
  assert.equal(newLoginResponse.status, 200);
});

test("forgot and reset password invalidate existing refresh tokens", async () => {
  await User.create({
    name: "Customer One",
    email: "customer@example.com",
    phone: "9999999991",
    password: strongPassword,
    role: "customer",
  });

  const agent = request.agent(app);
  const loginResponse = await agent.post("/api/auth/login").send({
    email: "customer@example.com",
    password: strongPassword,
  });
  assert.equal(loginResponse.status, 200);

  const forgotResponse = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "customer@example.com" });
  assert.equal(forgotResponse.status, 200);
  assert.ok(forgotResponse.body.resetToken);
  const storedReset = await User.findOne({ email: "customer@example.com" })
    .select("+passwordResetTokenHash +passwordResetExpiresAt");
  assert.notEqual(storedReset.passwordResetTokenHash, forgotResponse.body.resetToken);
  assert.equal(storedReset.passwordResetTokenHash.length, 64);
  assert.ok(storedReset.passwordResetExpiresAt > new Date());

  const resetResponse = await request(app).post("/api/auth/reset-password").send({
    token: forgotResponse.body.resetToken,
    password: "Better@12345",
  });
  assert.equal(resetResponse.status, 200);

  const replayResponse = await request(app).post("/api/auth/reset-password").send({
    token: forgotResponse.body.resetToken,
    password: "Another@12345",
  });
  assert.equal(replayResponse.status, 400);

  const oldAccessResponse = await agent.get("/api/auth/me");
  assert.equal(oldAccessResponse.status, 401);

  const oldSessionRefresh = await agent.post("/api/auth/refresh");
  assert.equal(oldSessionRefresh.status, 401);

  const newLoginResponse = await request(app).post("/api/auth/login").send({
    email: "customer@example.com",
    password: "Better@12345",
  });
  assert.equal(newLoginResponse.status, 200);
});

test("expired reset tokens fail and unknown emails receive the same response", async () => {
  const unknown = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "missing@example.com" });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.resetToken, undefined);

  const user = await User.create({
    name: "Expiry Test",
    email: "expiry@example.com",
    phone: "9999999998",
    password: strongPassword,
    role: "customer",
  });
  const requested = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: user.email });
  await User.updateOne(
    { _id: user._id },
    { passwordResetExpiresAt: new Date(Date.now() - 1000) },
  );
  const expired = await request(app).post("/api/auth/reset-password").send({
    token: requested.body.resetToken,
    password: "Changed@12345",
  });
  assert.equal(expired.status, 400);
  assert.match(expired.body.message, /invalid or expired/i);
});

test("forgot password endpoint applies its dedicated rate limit", async () => {
  const responses = [];
  for (let index = 0; index < 4; index += 1) {
    responses.push(await request(app)
      .post("/api/auth/forgot-password")
      .set("x-enable-rate-limit-test", "true")
      .send({ email: `limited${index}@example.com` }));
  }
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 429]);
  assert.ok(responses[3].headers["ratelimit-reset"]);
});
