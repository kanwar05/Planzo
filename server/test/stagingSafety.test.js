import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { spawnSync } from "node:child_process";
import { Writable } from "node:stream";
import express from "express";
import request from "supertest";
import cloudinary, { destroyOwnedImage } from "../src/config/cloudinary.js";
import { validateEnvironment } from "../src/config/environment.js";
import { databaseConnectionOptions } from "../src/config/database.js";
import {
  assertStagingDatabase, assertStagingEmailRecipient, imageFolder, validateStagingEnvironment,
} from "../src/config/stagingSafety.js";
import { setAccountEmailSenderForTests, sendPasswordReset, sendEmailChange } from "../src/services/accountEmailService.js";
import { setOtpEmailSenderForTests, sendLoginOtp } from "../src/services/otpEmailService.js";
import { setBookingEmailSenderForTests, sendBookingEmail } from "../src/services/bookingEmailService.js";
import { uploadProfileImage } from "../src/middleware/upload.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";

const base = {
  NODE_ENV: "test", APP_ENV: "staging", MONGODB_URI: "mongodb://127.0.0.1:27017/planzo_staging",
  STAGING_MONGO_HOST: "127.0.0.1", STAGING_DATABASE_NAME: "planzo_staging",
  JWT_SECRET: "local-staging-safety-secret-at-least-32-characters",
  CLIENT_URL: "https://planzo-staging.example.invalid", STAGING_FRONTEND_ORIGIN: "https://planzo-staging.example.invalid",
  SMTP_HOST: "smtp.staging.example.invalid", STAGING_SMTP_HOST: "smtp.staging.example.invalid",
  SMTP_FROM_EMAIL: "sender@example.test", SMTP_USER: "test-sender", SMTP_APP_PASSWORD: "test-password",
  STAGING_EMAIL_MODE: "sandbox", STAGING_EMAIL_RECIPIENTS: "customer@example.test,vendor@example.test",
};
const keys = [...Object.keys(base), "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "STAGING_CLOUDINARY_CLOUD_NAME"];
let original;
beforeEach(() => {
  original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  Object.assign(process.env, base);
});
afterEach(() => {
  mock.restoreAll();
  process.env.NODE_ENV = "test";
  setAccountEmailSenderForTests(undefined); setOtpEmailSenderForTests(undefined); setBookingEmailSenderForTests(undefined);
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("staging configuration pins the explicit database, frontend, SMTP host and exact recipients", () => {
  assert.doesNotThrow(() => validateEnvironment(base));
  assert.doesNotThrow(() => validateEnvironment({ ...base, NODE_ENV: "production", OTP_HMAC_SECRET: "staging-test-otp-secret-at-least-32-characters" }));
  assert.doesNotThrow(() => assertStagingEmailRecipient("CUSTOMER@example.test", base));
  for (const key of ["STAGING_MONGO_HOST", "STAGING_DATABASE_NAME", "STAGING_FRONTEND_ORIGIN", "STAGING_SMTP_HOST", "STAGING_EMAIL_MODE", "STAGING_EMAIL_RECIPIENTS"])
    assert.throws(() => validateStagingEnvironment({ ...base, [key]: "" }), (error) => error.code === "STAGING_ISOLATION");
});

test("database pinning refuses production names, changed hosts, URI database overrides and silently disabled staging mode", () => {
  for (const env of [
    { MONGODB_URI: "mongodb://127.0.0.1:27017/planzo" },
    { MONGODB_URI: "mongodb://another.invalid/planzo_staging" },
    { STAGING_DATABASE_NAME: "planzo_production_staging", MONGODB_URI: "mongodb://127.0.0.1:27017/planzo_production_staging" },
    { MONGODB_URI: "mongodb://127.0.0.1:27017/planzo_staging?dbName=production" },
    { MONGODB_URI: "mongodb://127.0.0.1:27017/planzo_staging?loadbalanced=true" },
    { APP_ENV: undefined },
  ]) {
    assert.throws(() => databaseConnectionOptions({ ...base, ...env }), (error) => error.code === "STAGING_ISOLATION");
  }
  assert.doesNotThrow(() => assertStagingDatabase({ APP_ENV: "production", MONGODB_URI: "mongodb://127.0.0.1:27017/planzo" }));
});

test("staging email configuration rejects wildcards, recipient lists, production dashboard links and mismatched SMTP", () => {
  for (const recipient of ["real-customer@example.com", "customer@example.test,vendor@example.test", "Customer <customer@example.test>", "customer@example.test\r\nBcc: real@example.com", "customer(comment)@example.test", "customer:real@example.test", '"customer"@example.test'])
    assert.throws(() => assertStagingEmailRecipient(recipient, base));
  for (const env of [
    { STAGING_EMAIL_RECIPIENTS: "*@example.test" },
    { STAGING_EMAIL_RECIPIENTS: "customer(comment)@example.test" },
    { STAGING_EMAIL_RECIPIENTS: "customer:real@example.test" },
    { STAGING_EMAIL_MODE: "live" },
    { NODE_ENV: "development" },
    { SMTP_HOST: "different.invalid" },
    { CLIENT_URL: "https://planzo.example.invalid" },
    { CLIENT_URL: "https://planzo-staging.example.invalid,https://planzo.example.invalid" },
    { STAGING_FRONTEND_ORIGIN: "https://planzo.example.invalid", CLIENT_URL: "https://planzo.example.invalid" },
  ]) assert.throws(() => validateStagingEnvironment({ ...base, ...env }));
});

test("every account, OTP and booking sender refuses non-test recipients before invoking the transport", async () => {
  let calls = 0;
  const sender = async (message) => { calls++; return { accepted: [message.to], rejected: [] }; };
  setAccountEmailSenderForTests(sender); setOtpEmailSenderForTests(sender); setBookingEmailSenderForTests(sender);
  for (const operation of [
    () => sendPasswordReset({ user: { email: "real-customer@example.com" }, token: "test-only-token" }),
    () => sendEmailChange({ email: "real-customer@example.com", token: "test-only-token" }),
    () => sendLoginOtp({ email: "real-customer@example.com", code: "123456" }),
    () => sendBookingEmail({ recipientEmail: "real-customer@example.com" }),
  ]) await assert.rejects(async () => operation(), (error) => error.code === "STAGING_ISOLATION");
  assert.equal(calls, 0);
  await sendPasswordReset({ user: { email: "customer@example.test" }, token: "test-only-token" });
  await sendEmailChange({ email: "customer@example.test", token: "test-only-token" });
  await sendLoginOtp({ email: "vendor@example.test", code: "123456" });
  await sendBookingEmail({
    recipientEmail: "customer@example.test", bookingId: "507f191e810c19729de860ea", eventId: "test-event", recipientUserId: "507f191e810c19729de860eb",
    eventType: "booking_accepted", payload: { recipientRole: "customer", eventDateOnly: "2028-01-01" },
  });
  assert.equal(calls, 4);
});

test("staging image uploads use a separate public-ID namespace and deletion cannot reach legacy production references", async () => {
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "planzo-staging-test", STAGING_CLOUDINARY_CLOUD_NAME: "planzo-staging-test", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret" });
  assert.equal(imageFolder("eventifyy/vendors/profile"), "eventifyy/staging/vendors/profile");
  const calls = [];
  mock.method(cloudinary.uploader, "destroy", async (id) => { calls.push(id); return { result: "ok" }; });
  for (const id of ["eventifyy/vendors/profile/legacy", "eventifyy/staging/../vendors/foreign", "other/staging/photo"])
    assert.throws(() => destroyOwnedImage(id));
  assert.equal(calls.length, 0);
  await destroyOwnedImage("eventifyy/staging/vendors/profile/test-only-id");
  assert.equal(calls.length, 1);
  process.env.CLOUDINARY_CLOUD_NAME = "different-cloud";
  assert.throws(() => imageFolder("eventifyy/vendors/profile"));
  assert.throws(() => destroyOwnedImage("eventifyy/staging/vendors/profile/test-only-id"));
  assert.equal(calls.length, 1);
});

test("the live multipart middleware sends only the staging namespace to the mocked image provider", async () => {
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "planzo-staging-test", STAGING_CLOUDINARY_CLOUD_NAME: "planzo-staging-test", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret" });
  const uploaded = [];
  mock.method(cloudinary.uploader, "upload_stream", (options, callback) => {
    uploaded.push(options.public_id);
    return new Writable({ write(chunk, encoding, done) { done(); }, final(done) {
      callback(null, { public_id: options.public_id, secure_url: `https://assets.example.invalid/${options.public_id}`, bytes: 1 }); done();
    } });
  });
  const app = express(); app.post("/image", uploadProfileImage, (req, res) => res.json({ success: true })); app.use(errorHandler);
  const response = await request(app).post("/image").attach("profileImage", Buffer.from("test-provider-decodes-image"), { filename: "photo.png", contentType: "image/png" });
  assert.equal(response.status, 200);
  assert.match(uploaded[0], /^eventifyy\/staging\/vendors\/profile\/[a-f0-9-]{36}$/);
});

test("non-staging deployments retain existing image IDs and email routing", () => {
  const env = { APP_ENV: "production" };
  assert.equal(imageFolder("eventifyy/vendors/profile", env), "eventifyy/vendors/profile");
  assert.doesNotThrow(() => assertStagingEmailRecipient("customer@example.com", env));
  assert.doesNotThrow(() => validateStagingEnvironment(env));
});

test("the staging configuration CLI makes no network calls and outputs no credentials or recipients", () => {
  const result = spawnSync(process.execPath, ["scripts/checkStagingEnvironment.js"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 5000,
    env: { ...process.env, MONGODB_URI: "mongodb://unreachable.invalid/planzo_staging" },
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { event: "staging_configuration", success: false, scope: "configuration_only", category: "staging_configuration_invalid" });
  assert.doesNotMatch(result.stdout + result.stderr, /unreachable|test-password|customer@example|vendor@example/);
});
