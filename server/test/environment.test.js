import assert from "node:assert/strict";
import { test } from "node:test";
import { validateEnvironment } from "../src/config/environment.js";

const base = { MONGODB_URI: "mongodb://localhost:27017/planzo", JWT_SECRET: "test-secret-with-at-least-32-characters" };

test("local core configuration needs no removed integration credentials", () => {
  assert.doesNotThrow(() => validateEnvironment(base));
  assert.throws(() => validateEnvironment({ ...base, JWT_SECRET: "weak" }), /32 characters/);
  assert.throws(() => validateEnvironment({ ...base, MONGODB_URI: "https://database" }), /MongoDB/);
});

test("production requires HTTPS origins and account recovery email", () => {
  const production = { ...base, NODE_ENV: "production", CLIENT_URL: "https://planzo.example", SMTP_HOST: "smtp.example", SMTP_FROM: "Planzo <accounts@example.com>", SMTP_FROM_EMAIL: "accounts@example.com", SMTP_USER: "mailer@example.com", SMTP_APP_PASSWORD: "app-password", OTP_HMAC_SECRET: "otp-test-secret-with-at-least-32-characters" };
  assert.doesNotThrow(() => validateEnvironment(production));
  assert.throws(() => validateEnvironment({ ...production, CLIENT_URL: "http://planzo.example" }), /HTTPS/);
  assert.throws(() => validateEnvironment({ ...production, CLIENT_URL: "https://planzo.example/path" }), /origins/);
  assert.throws(() => validateEnvironment({ ...production, SMTP_HOST: "" }), /SMTP/);
});

test("invalid lifetimes, ports, proxy and partially configured integrations fail early", () => {
  for (const [key, value] of [["PORT", "70000"], ["SMTP_PORT", "mail"], ["TRUST_PROXY", "true"], ["JWT_REFRESH_EXPIRES_DAYS", "-1"], ["JWT_ACCESS_EXPIRES_IN", "forever"], ["COOKIE_SAME_SITE", "bad"]]) {
    assert.throws(() => validateEnvironment({ ...base, [key]: value }), new RegExp(key));
  }
  assert.throws(() => validateEnvironment({ ...base, SMTP_USER: "only-user" }), /SMTP_USER/);
  assert.throws(() => validateEnvironment({ ...base, CLOUDINARY_CLOUD_NAME: "only-cloud" }), /Cloudinary/);
});
