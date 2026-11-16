import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import EmailOtp from "../src/models/EmailOtp.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";
import { setAccountEmailSenderForTests } from "../src/services/accountEmailService.js";
import { setOtpEmailSenderForTests } from "../src/services/otpEmailService.js";
import { assertVerifiedEmail, hasVerifiedEmail } from "../src/utils/emailVerification.js";

const password = "Verification@Test123";
let mongo;
let sequence = 0;
let messages;
let accountMessages;
const deliveredCode = () => messages.at(-1).text.match(/\b\d{6}\b/)[0];

async function account(overrides = {}) {
  sequence += 1;
  const user = await User.create({
    name: "Verification Customer", email: `verify-${sequence}@example.test`,
    phone: "9876543210", password, role: "customer", ...overrides,
  });
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email: user.email, password });
  assert.equal(response.status, 200);
  return { user, agent, response };
}
const requestProof = (agent, body = {}) => agent.post("/api/auth/email-verification/request").send(body);
const verifyProof = (agent, code, extra = {}) => agent.post("/api/auth/email-verification/verify").send({ code, ...extra });

before(async () => {
  process.env.JWT_SECRET = "email-verification-jwt-secret-at-least-32-characters";
  process.env.OTP_HMAC_SECRET = "email-verification-otp-secret-at-least-32-characters";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), EmailOtp.init(), RefreshToken.init()]);
});
beforeEach(async () => {
  messages = [];
  accountMessages = [];
  setOtpEmailSenderForTests(async message => { messages.push(message); });
  setAccountEmailSenderForTests(async message => { accountMessages.push(message); });
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
afterEach(() => { mock.restoreAll(); });
after(async () => {
  setOtpEmailSenderForTests(undefined);
  setAccountEmailSenderForTests(undefined);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("registration cannot self-verify and existing missing proofs remain unverified through password login and refresh", async () => {
  const agent = request.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    name: "Initial Customer", email: "initial@example.test", phone: "9876543210", password,
    emailVerified: true, emailVerifiedAt: new Date().toISOString(),
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.emailVerified, false);
  assert.equal(registered.body.user.emailVerifiedAt, undefined);
  assert.equal((await agent.get("/api/auth/me")).body.user.emailVerified, false);
  assert.equal((await agent.post("/api/auth/refresh")).body.user.emailVerified, false);
  const stored = await User.findOne({ email: "initial@example.test" });
  assert.equal(stored.emailVerifiedAt, null);
  await User.collection.updateOne({ _id: stored._id }, { $unset: { emailVerifiedAt: "" } });
  const legacyLogin = await request(app).post("/api/auth/login").send({ email: stored.email, password });
  assert.equal(legacyLogin.status, 200);
  assert.equal(legacyLogin.body.user.emailVerified, false);
  assert.equal((await User.findById(stored._id)).emailVerifiedAt, null);
});

test("only a valid timestamp satisfies the reusable ownership guard and administrators retain their permission model", () => {
  for (const value of [undefined, null, "2026-01-01", new Date("invalid")]) {
    assert.equal(hasVerifiedEmail({ emailVerifiedAt: value }), false);
    assert.throws(() => assertVerifiedEmail({ role: "vendor", emailVerifiedAt: value }), error =>
      error.statusCode === 403 && error.publicCode === "EMAIL_VERIFICATION_REQUIRED");
  }
  assert.equal(hasVerifiedEmail({ emailVerifiedAt: new Date() }), true);
  assert.doesNotThrow(() => assertVerifiedEmail({ role: "customer", emailVerifiedAt: new Date() }));
  assert.doesNotThrow(() => assertVerifiedEmail({ role: "admin" }));
});

test("verification request requires a session, uses only its current mailbox and shares login OTP cooldown", async () => {
  assert.equal((await requestProof(request(app))).status, 401);
  const { user, agent } = await account();
  const response = await requestProof(agent, { email: "unrelated@example.test" });
  assert.equal(response.status, 200);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, user.email);
  assert.equal(JSON.stringify(response.body).includes(deliveredCode()), false);
  assert.equal((await requestProof(agent)).status, 200);
  assert.equal((await request(app).post("/api/auth/login/otp/request").send({ email: user.email })).status, 200);
  assert.equal(messages.length, 1);
  const challenge = await EmailOtp.findById(user._id);
  assert.notEqual(challenge.codeHash, deliveredCode());
  assert.equal(challenge.attempts, 0);
});

test("concurrent verification requests deliver one challenge and successful proof is single-use without replacing the session", async () => {
  const { user, agent } = await account({ role: "vendor" });
  const responses = await Promise.all(Array.from({ length: 5 }, () => requestProof(agent)));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(messages.length, 1);
  const code = deliveredCode();
  const response = await verifyProof(agent, code, { email: "another@example.test", emailVerifiedAt: "arbitrary" });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.emailVerified, true);
  assert.equal(response.body.user.email, user.email);
  assert.equal(response.body.user.password, undefined);
  assert.equal(response.body.user.authVersion, undefined);
  assert.ok((await User.findById(user._id)).emailVerifiedAt instanceof Date);
  assert.equal((await agent.get("/api/auth/me")).body.user.emailVerified, true);
  assert.equal((await agent.post("/api/auth/refresh")).body.user.emailVerified, true);
  assert.equal((await verifyProof(agent, code)).status, 401);
  assert.equal((await requestProof(agent)).status, 200);
  assert.equal(messages.length, 1, "already verified accounts do not send another code");
});

test("verification attempts share the atomic budget with login and reject expiry or cross-account proof", async () => {
  const { user, agent } = await account();
  const second = await account();
  await requestProof(agent);
  const code = deliveredCode();
  assert.equal((await verifyProof(second.agent, code, { email: user.email })).status, 401);
  await EmailOtp.updateOne({ _id: user._id }, { $set: { attempts: 4 } });
  const responses = await Promise.all(Array.from({ length: 8 }, () => verifyProof(agent, "000000")));
  assert.ok(responses.every(response => response.status === 401));
  assert.ok(responses.every(response => response.body.code === "OTP_VERIFICATION_FAILED"));
  assert.equal((await EmailOtp.findById(user._id)).attempts, 5);
  assert.equal((await request(app).post("/api/auth/login/otp/verify").send({ email: user.email, code })).status, 401);
  assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
  await EmailOtp.updateOne({ _id: user._id }, { $set: { attempts: 0, expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await verifyProof(agent, code)).status, 401);
  assert.equal((await User.findById(second.user._id)).emailVerifiedAt, null);
});

test("simultaneous correct verification consumes one proof and login OTP verifies existing accounts", async () => {
  const { user, agent } = await account();
  await requestProof(agent);
  const code = deliveredCode();
  const responses = await Promise.all(Array.from({ length: 5 }, () => verifyProof(agent, code)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401, 401, 401, 401]);
  const second = await account();
  await request(app).post("/api/auth/login/otp/request").send({ email: second.user.email });
  const loggedIn = await request(app).post("/api/auth/login/otp/verify").send({ email: second.user.email, code: deliveredCode() });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.body.user.emailVerified, true);
  assert.ok((await User.findById(user._id)).emailVerifiedAt);
  assert.ok((await User.findById(second.user._id)).emailVerifiedAt);
});

test("mail failures clean only their challenge and cannot mark an account verified", async () => {
  const { user, agent } = await account();
  setOtpEmailSenderForTests(async () => { throw new Error("private-provider-value"); });
  const response = await requestProof(agent);
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(response.body).includes("private-provider-value"), false);
  assert.equal(await EmailOtp.countDocuments({ email: user.email }), 0);
  assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
});

test("pending email changes do not prove ownership and confirmation verifies the new mailbox while revoking sessions", async () => {
  const { user, agent } = await account();
  const pending = await agent.post("/api/auth/email-change").send({ email: "new-owner@example.test", currentPassword: password });
  assert.equal(pending.status, 200);
  assert.equal((await agent.get("/api/auth/me")).body.user.emailVerified, false);
  const token = new URL(accountMessages.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  const response = await request(app).post("/api/auth/email-change/confirm").send({ token });
  assert.equal(response.status, 200);
  const stored = await User.findById(user._id);
  assert.equal(stored.email, "new-owner@example.test");
  assert.ok(stored.emailVerifiedAt instanceof Date);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  const fresh = await request(app).post("/api/auth/login").send({ email: stored.email, password });
  assert.equal(fresh.body.user.emailVerified, true);
});

test("a proof racing an email or credential change cannot mark the changed account verified", async () => {
  for (const change of [
    { $set: { email: "raced-new@example.test" }, $inc: { authVersion: 1 } },
    { $inc: { authVersion: 1 } },
  ]) {
    const { user, agent } = await account();
    await requestProof(agent);
    const original = User.findOneAndUpdate;
    const hooked = mock.method(User, "findOneAndUpdate", async function (...args) {
      if (args[1]?.$set?.emailVerifiedAt) {
        await User.collection.updateOne({ _id: user._id }, change);
        hooked.mock.restore();
      }
      return original.apply(this, args);
    });
    const response = await verifyProof(agent, deliveredCode());
    assert.equal(response.status, 401);
    assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
    assert.equal((await agent.get("/api/auth/me")).status, 401);
  }
});

test("verification endpoints validate codes and inactive accounts cannot complete ownership proof", async () => {
  const { user, agent } = await account();
  await requestProof(agent);
  for (const code of [undefined, "", "12345", "1234567", 123456, { $ne: null }])
    assert.equal((await verifyProof(agent, code)).status, 400);
  await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await verifyProof(agent, deliveredCode())).status, 403);
  assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
});

test("password reset invalidates outstanding mailbox codes and a fresh version-bound code can be issued immediately", async () => {
  const { user, agent } = await account();
  await requestProof(agent);
  const oldCode = deliveredCode();
  assert.equal((await EmailOtp.findById(user._id)).authVersion, 0);
  await agent.post("/api/auth/forgot-password").send({ email: user.email });
  const token = new URL(accountMessages.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  const newPassword = "ResetVerification@Test123";
  const reset = await request(app).post("/api/auth/reset-password").send({ token, password: newPassword });
  assert.equal(reset.status, 200);
  assert.equal((await request(app).post("/api/auth/login/otp/verify").send({ email: user.email, code: oldCode })).status, 401);
  assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  const fresh = request.agent(app);
  assert.equal((await fresh.post("/api/auth/login").send({ email: user.email, password: newPassword })).status, 200);
  assert.equal((await requestProof(fresh)).status, 200);
  assert.equal(messages.length, 2, "a stale credential version must not suppress a fresh code through cooldown");
  assert.equal((await EmailOtp.findById(user._id)).authVersion, 1);
  assert.equal((await verifyProof(fresh, deliveredCode())).status, 200);
});

test("legacy missing versions work only for unchanged accounts and malformed challenge versions fail closed", async () => {
  const { user, agent } = await account();
  await requestProof(agent);
  const code = deliveredCode();
  for (const authVersion of [null, "0", {}, [-1], -1, 0.5, Number.NaN]) {
    await EmailOtp.collection.updateOne({ _id: user._id }, { $set: { authVersion, attempts: 0 } });
    const response = await verifyProof(agent, code);
    assert.equal(response.status, 401);
    assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
  }
  await EmailOtp.collection.updateOne({ _id: user._id }, { $unset: { authVersion: "" } });
  assert.equal((await verifyProof(agent, code)).status, 200, "version-0 legacy challenges remain compatible");

  const changed = await account({ authVersion: 3 });
  await requestProof(changed.agent);
  const legacyCode = deliveredCode();
  await EmailOtp.collection.updateOne({ _id: changed.user._id }, { $unset: { authVersion: "" } });
  assert.equal((await verifyProof(changed.agent, legacyCode)).status, 401);
  assert.equal((await requestProof(changed.agent)).status, 200);
  assert.equal((await EmailOtp.findById(changed.user._id)).authVersion, 3);
  assert.equal((await verifyProof(changed.agent, deliveredCode())).status, 200);
});

test("OTP login racing a credential change cannot create a session or apply ownership proof", async () => {
  const { user, agent } = await account();
  await requestProof(agent);
  const initialSessions = await RefreshToken.countDocuments();
  const original = User.findOneAndUpdate;
  const hooked = mock.method(User, "findOneAndUpdate", async function (...args) {
    if (args[1]?.$set?.emailVerifiedAt) {
      await User.collection.updateOne({ _id: user._id }, { $inc: { authVersion: 1 } });
      hooked.mock.restore();
    }
    return original.apply(this, args);
  });
  const response = await request(app).post("/api/auth/login/otp/verify").send({ email: user.email, code: deliveredCode() });
  assert.equal(response.status, 401);
  assert.equal((await User.findById(user._id)).emailVerifiedAt, null);
  assert.equal(await RefreshToken.countDocuments(), initialSessions);
});

test("an old SMTP failure cannot delete a newer credential-version challenge with identical code and issue time", async () => {
  const { user, agent } = await account();
  const issueTime = new Date();
  mock.method(crypto, "randomInt", () => 123456);
  const original = EmailOtp.findOneAndUpdate;
  mock.method(EmailOtp, "findOneAndUpdate", function (filter, update, ...args) {
    if (update.$set?.codeHash) update.$set.requestedAt = issueTime;
    return original.call(this, filter, update, ...args);
  });
  let started;
  let failFirst;
  const firstStarted = new Promise(resolve => { started = resolve; });
  let sends = 0;
  setOtpEmailSenderForTests(async () => {
    sends += 1;
    if (sends === 1) {
      started();
      return new Promise((resolve, reject) => { failFirst = reject; });
    }
  });
  const first = requestProof(agent).then(response => response);
  await firstStarted;
  await User.collection.updateOne({ _id: user._id }, { $inc: { authVersion: 1 } });
  const replacement = await request(app).post("/api/auth/login/otp/request").send({ email: user.email });
  assert.equal(replacement.status, 200);
  assert.equal(sends, 2);
  failFirst(new Error("old provider failure"));
  assert.equal((await first).status, 503);
  const challenge = await EmailOtp.findById(user._id);
  assert.ok(challenge);
  assert.equal(challenge.authVersion, 1);
  assert.equal(challenge.requestedAt.getTime(), issueTime.getTime());
  assert.equal((await request(app).post("/api/auth/login/otp/verify").send({ email: user.email, code: "123456" })).status, 200);
});

test("initial verification endpoints retain dedicated request and confirmation rate limits", async () => {
  const { agent } = await account();
  const issued = [];
  for (let index = 0; index < 4; index += 1)
    issued.push(await agent.post("/api/auth/email-verification/request").set("x-enable-rate-limit-test", "true").send({}));
  assert.deepEqual(issued.map(response => response.status), [200, 200, 200, 429]);
  const attempted = [];
  for (let index = 0; index < 11; index += 1)
    attempted.push(await agent.post("/api/auth/email-verification/verify").set("x-enable-rate-limit-test", "true").send({ code: "000000" }));
  assert.ok(attempted.slice(0, 10).every(response => response.status === 401));
  assert.equal(attempted.at(-1).status, 429);
  assert.ok(attempted.at(-1).headers["ratelimit-reset"]);
});
