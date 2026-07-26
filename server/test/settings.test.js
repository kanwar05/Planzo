import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import AccountSettings from "../src/models/AccountSettings.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";

let mongo;
const password = "Planzo@123";

before(async () => {
  process.env.JWT_SECRET = "settings-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), AccountSettings.syncIndexes()]);
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function signedInAgent(userAgent = "Mozilla/5.0 (Macintosh) Chrome/120") {
  await User.create({ name: "Settings User", email: "settings@example.com", phone: "9999999991", password });
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").set("user-agent", userAgent).send({ email: "settings@example.com", password });
  assert.equal(response.status, 200);
  return agent;
}

test("settings are created with defaults and valid sections are persisted", async () => {
  const agent = await signedInAgent();
  const initial = await agent.get("/api/settings");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.settings.theme.mode, "system");
  assert.equal(initial.body.settings.privacy.profileVisibility, "members");

  const updated = await agent.patch("/api/settings").send({
    email: { newsletter: true },
    privacy: { profileVisibility: "private" },
    theme: { mode: "dark" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.settings.email.newsletter, true);
  assert.equal(updated.body.settings.privacy.profileVisibility, "private");
  assert.equal(updated.body.settings.theme.mode, "dark");

  const invalid = await agent.patch("/api/settings").send({ theme: { mode: "neon" } });
  assert.equal(invalid.status, 400);
});

test("sessions expose device metadata and other sessions can be revoked", async () => {
  const first = await signedInAgent("Mozilla/5.0 (Macintosh) Chrome/120");
  const second = request.agent(app);
  await second.post("/api/auth/login").set("user-agent", "Mozilla/5.0 (iPhone) Safari/17").send({
    email: "settings@example.com", password,
  });

  const sessions = await first.get("/api/settings/sessions");
  assert.equal(sessions.status, 200);
  assert.equal(sessions.body.sessions.length, 2);
  assert.ok(sessions.body.sessions.some((session) => session.current));
  assert.ok(sessions.body.sessions.some((session) => session.device.type === "Mobile device"));

  const revoked = await first.delete("/api/settings/sessions/others");
  assert.equal(revoked.status, 200);
  assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 1);
});

test("deactivation requires a password, revokes sessions, and prevents login", async () => {
  const agent = await signedInAgent();
  const wrong = await agent.post("/api/settings/deactivate").send({ password: "Wrong@123" });
  assert.equal(wrong.status, 401);

  const response = await agent.post("/api/settings/deactivate").send({ password });
  assert.equal(response.status, 200);
  const user = await User.findOne({ email: "settings@example.com" });
  assert.equal(user.accountStatus, "deactivated");
  assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 0);

  const login = await request(app).post("/api/auth/login").send({ email: "settings@example.com", password });
  assert.equal(login.status, 403);
});
