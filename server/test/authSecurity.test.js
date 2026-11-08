import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import EmailOtp from "../src/models/EmailOtp.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";
import { setOtpEmailSenderForTests } from "../src/services/otpEmailService.js";
import { clearAuthCookies, generateAccessToken, setAuthCookies } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
let outbox;
const password = "PlanzoSecurity123!";
const otpHash = code => crypto.createHmac("sha256", process.env.OTP_HMAC_SECRET).update(code).digest("hex");
const requestCode = email => request(app).post("/api/auth/login/otp/request").send({ email });
const verifyCode = (email, code) => request(app).post("/api/auth/login/otp/verify").send({ email, code });
const deliveredCode = () => outbox.at(-1).text.match(/\b\d{6}\b/)[0];
const cookie = (response, name) => response.headers["set-cookie"].find(value => value.startsWith(`${name}=`)).split(";")[0];
async function newUser(role = "customer") {
  sequence += 1;
  return User.create({ name: `Security User ${sequence}`, email: `security-${sequence}@example.com`,
    phone: `987650${String(sequence).padStart(4, "0")}`, password, role });
}

before(async () => {
  process.env.JWT_SECRET = "security-tests-jwt-secret-at-least-32-characters";
  process.env.OTP_HMAC_SECRET = "security-tests-otp-secret-at-least-32-characters";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), RefreshToken.init(), EmailOtp.init()]);
});
beforeEach(async () => {
  mock.restoreAll();
  outbox = [];
  setOtpEmailSenderForTests(async message => { outbox.push(message); });
  await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
});
afterEach(() => { mock.restoreAll(); });
after(async () => {
  setOtpEmailSenderForTests(undefined);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("production cookies retain legacy names, Secure/HttpOnly, host-only scope and matching clear options", async () => {
  const keys = ["NODE_ENV", "COOKIE_SAME_SITE", "ACCESS_COOKIE_MAX_AGE_MS", "REFRESH_COOKIE_MAX_AGE_MS"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const cookieApp = express();
  cookieApp.post("/set", (req, res) => { setAuthCookies(res, { accessToken: "access", refreshToken: "refresh" }); res.sendStatus(204); });
  cookieApp.post("/clear", (req, res) => { clearAuthCookies(res); res.sendStatus(204); });
  process.env.NODE_ENV = "production";
  process.env.ACCESS_COOKIE_MAX_AGE_MS = "60000";
  process.env.REFRESH_COOKIE_MAX_AGE_MS = "120000";
  try {
    for (const sameSite of ["none", "lax", "strict"]) {
      process.env.COOKIE_SAME_SITE = sameSite;
      const response = await request(cookieApp).post("/set");
      const values = response.headers["set-cookie"];
      assert.equal(values.length, 2);
      for (const value of values) {
        assert.match(value, /; Secure/);
        assert.match(value, /; HttpOnly/);
        assert.match(value, /; Path=\//);
        assert.match(value, new RegExp(`; SameSite=${sameSite}`, "i"));
        assert.doesNotMatch(value, /; Domain=/i);
      }
      assert.match(values[0], /^eventifyy_access=access; Max-Age=60;/);
      assert.match(values[1], /^eventifyy_refresh=refresh; Max-Age=120;/);
      for (const value of (await request(cookieApp).post("/clear")).headers["set-cookie"]) {
        assert.match(value, /Expires=Thu, 01 Jan 1970/);
        assert.match(value, /; Secure/);
        assert.match(value, new RegExp(`; SameSite=${sameSite}`, "i"));
      }
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test("expired, wrongly signed, unsupported algorithm, malformed and wrong-type JWTs cannot authenticate", async () => {
  const user = await newUser();
  const valid = { id: String(user._id), type: "access", authVersion: 0 };
  const secret = process.env.JWT_SECRET;
  const tokens = [
    jwt.sign(valid, secret, { expiresIn: -1 }),
    jwt.sign(valid, "another-secret", { expiresIn: "15m" }),
    jwt.sign(valid, secret, { algorithm: "HS384", expiresIn: "15m" }),
    jwt.sign({ ...valid, type: "refresh" }, secret, { expiresIn: "15m" }),
    jwt.sign({ ...valid, id: "invalid-id" }, secret, { expiresIn: "15m" }),
    "not-a-jwt",
  ];
  for (const token of tokens) {
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    assert.equal(response.status, 401);
    assert.equal(response.body.user, undefined);
  }
  const token = generateAccessToken(user._id);
  await User.updateOne({ _id: user._id }, { $inc: { authVersion: 1 } });
  assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status, 401);
});

test("cookie precedence and live inactive-account restrictions remain enforced for API clients", async () => {
  const user = await newUser();
  const access = generateAccessToken(user._id);
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", `eventifyy_access=${access}`).set("Authorization", "Bearer invalid")).status, 200);
  assert.equal((await request(app).get("/api/auth/me").set("Cookie", "eventifyy_access=invalid").set("Authorization", `Bearer ${access}`)).status, 401);
  for (const accountStatus of ["deactivated", "blocked", "suspended", "unknown-legacy-state"]) {
    await User.collection.updateOne({ _id: user._id }, { $set: { accountStatus } });
    assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${access}`)).status, 403, accountStatus);
  }
  await User.collection.updateOne({ _id: user._id }, { $set: { accountStatus: "active", suspendedAt: new Date() } });
  assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${access}`)).status, 403);
});

test("concurrent OTP issuance sends one code and retains one challenge using the existing primary index", async () => {
  const user = await newUser();
  const original = EmailOtp.findOne;
  let entered = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const timer = setTimeout(release, 3000);
  const mocked = mock.method(EmailOtp, "findOne", async function (...args) {
    const found = await original.apply(this, args);
    entered += 1;
    if (entered === 5) release();
    await barrier;
    return found;
  });
  let responses;
  try {
    responses = await Promise.all(Array.from({ length: 5 }, () => requestCode(user.email)));
  } finally { clearTimeout(timer); mocked.mock.restore(); }
  assert.equal(entered, 5);
  assert.ok(responses.every(response => response.status === 200));
  assert.ok(responses.every(response => JSON.stringify(response.body) === JSON.stringify(responses[0].body)));
  assert.equal(outbox.length, 1);
  assert.equal(await EmailOtp.countDocuments({ email: user.email, consumedAt: null }), 1);
  const stored = await EmailOtp.findById(user._id);
  assert.equal(stored.codeHash, otpHash(deliveredCode()));
  assert.equal(JSON.stringify(responses[0].body).includes(deliveredCode()), false);
  assert.equal((await requestCode(user.email)).status, 200);
  assert.equal(outbox.length, 1, "cooldown must not resend the code");
});

test("parallel incorrect guesses cannot exceed the five-attempt OTP budget or redeem an exhausted code", async () => {
  const user = await newUser();
  assert.equal((await requestCode(user.email)).status, 200);
  const code = deliveredCode();
  await EmailOtp.updateOne({ email: user.email }, { $set: { attempts: 4 } });
  const responses = await Promise.all(Array.from({ length: 12 }, () => verifyCode(user.email, "000000")));
  assert.ok(responses.every(response => response.status === 401));
  assert.equal((await EmailOtp.findOne({ email: user.email })).attempts, 5);
  assert.equal((await verifyCode(user.email, code)).status, 401);
  assert.equal(await RefreshToken.countDocuments({}), 0);
});

test("the fifth permitted OTP attempt can succeed once even when correct requests arrive concurrently", async () => {
  const user = await newUser();
  await requestCode(user.email);
  const code = deliveredCode();
  await EmailOtp.updateOne({ email: user.email }, { $set: { attempts: 4 } });
  const responses = await Promise.all(Array.from({ length: 5 }, () => verifyCode(user.email, code)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401, 401, 401, 401]);
  const challenge = await EmailOtp.findOne({ email: user.email });
  assert.equal(challenge.attempts, 5);
  assert.ok(challenge.consumedAt);
  assert.equal(await RefreshToken.countDocuments({ revokedAt: null }), 1);
});

test("legacy random OTP keys remain readable and are replaced safely without an index migration", async () => {
  const user = await newUser();
  const legacyId = new mongoose.Types.ObjectId();
  await EmailOtp.create({ _id: legacyId, email: user.email, codeHash: otpHash("123456"),
    requestedAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() + 60000) });
  assert.equal((await requestCode(user.email)).status, 200);
  assert.equal(await EmailOtp.countDocuments({ email: user.email, consumedAt: null }), 1);
  assert.equal(await EmailOtp.findById(legacyId), null);
  assert.ok(await EmailOtp.findById(user._id));
  assert.equal((await verifyCode(user.email, "123456")).status, 401);
  assert.equal((await verifyCode(user.email, deliveredCode())).status, 200);
});

test("expired, corrupt and inactive-account OTPs fail without creating a session", async () => {
  const user = await newUser();
  await requestCode(user.email);
  const code = deliveredCode();
  await EmailOtp.updateOne({ email: user.email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await verifyCode(user.email, code)).status, 401);
  await EmailOtp.updateOne({ email: user.email }, { $set: { expiresAt: new Date(Date.now() + 60000), codeHash: "corrupt" } });
  assert.equal((await verifyCode(user.email, code)).status, 401);
  await EmailOtp.updateOne({ email: user.email }, { $set: { codeHash: otpHash(code), attempts: 0 } });
  await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await verifyCode(user.email, code)).status, 401);
  assert.equal(await RefreshToken.countDocuments({}), 0);
});

test("a verification started for an old issue cannot consume a replacement even if the random code repeats", async () => {
  const user = await newUser();
  mock.method(crypto, "randomInt", () => 123456);
  await requestCode(user.email);
  await EmailOtp.updateOne({ email: user.email }, { $set: { requestedAt: new Date(Date.now() - 120000) } });
  const original = EmailOtp.findOneAndUpdate;
  let reached;
  let release;
  const reachedAttempt = new Promise(resolve => { reached = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const mocked = mock.method(EmailOtp, "findOneAndUpdate", async function (...args) {
    if (args[1]?.$inc?.attempts) { reached(); await barrier; }
    return original.apply(this, args);
  });
  const stale = verifyCode(user.email, "123456").then(response => response);
  try {
    await reachedAttempt;
    assert.equal((await requestCode(user.email)).status, 200);
  } finally { release(); }
  assert.equal((await stale).status, 401);
  mocked.mock.restore();
  assert.equal((await EmailOtp.findOne({ email: user.email })).attempts, 0);
  assert.equal((await verifyCode(user.email, "123456")).status, 200);
});

test("a late delivery failure cannot delete a newer challenge with the same random code", async () => {
  const user = await newUser();
  mock.method(crypto, "randomInt", () => 123456);
  let started;
  let rejectFirst;
  const firstStarted = new Promise(resolve => { started = resolve; });
  let sends = 0;
  setOtpEmailSenderForTests(async () => {
    sends += 1;
    if (sends === 1) {
      started();
      return new Promise((resolve, reject) => { rejectFirst = reject; });
    }
  });
  const pendingFirst = requestCode(user.email).then(response => response);
  await firstStarted;
  await EmailOtp.updateOne({ email: user.email }, { $set: { requestedAt: new Date(Date.now() - 120000) } });
  assert.equal((await requestCode(user.email)).status, 200);
  rejectFirst(new Error("Provider unavailable"));
  assert.equal((await pendingFirst).status, 503);
  assert.equal(await EmailOtp.countDocuments({ email: user.email, consumedAt: null }), 1);
  assert.equal((await verifyCode(user.email, "123456")).status, 200);
});

test("SMTP failure removes only its issued challenge and logs no raw provider data", async () => {
  const user = await newUser();
  const logged = [];
  mock.method(console, "error", value => logged.push(String(value)));
  setOtpEmailSenderForTests(async () => { throw new Error("secret-password provider-reply private@example.com"); });
  const response = await requestCode(user.email);
  assert.equal(response.status, 503);
  assert.equal(await EmailOtp.countDocuments({ email: user.email }), 0);
  assert.ok(logged.some(line => line.includes("auth_email_delivery_failed")));
  for (const secret of ["secret-password", "provider-reply", "private@example.com", user.email])
    assert.equal(logged.join("\n").includes(secret), false);
});

test("logout revokes the presented refresh session, clears browser cookies and preserves other sessions", async () => {
  const user = await newUser();
  const login = () => request(app).post("/api/auth/login").send({ email: user.email, password });
  const [first, second] = await Promise.all([login(), login()]);
  const firstRefresh = cookie(first, "eventifyy_refresh");
  const secondRefresh = cookie(second, "eventifyy_refresh");
  const response = await request(app).post("/api/auth/logout").set("Cookie", firstRefresh);
  assert.equal(response.status, 200);
  assert.ok(response.headers["set-cookie"].every(value => /Expires=Thu, 01 Jan 1970/.test(value)));
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", firstRefresh)).status, 401);
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", secondRefresh)).status, 200);
});
