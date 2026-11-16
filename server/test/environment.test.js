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

test("access lifetimes cannot be already expired, subsecond or longer than one day", () => {
  for (const value of ["0s", "-1m", "120", "25h", "2d"])
    assert.throws(() => validateEnvironment({ ...base, JWT_ACCESS_EXPIRES_IN: value }), /JWT_ACCESS_EXPIRES_IN/);
  for (const value of ["1s", "15m", "24h"])
    assert.doesNotThrow(() => validateEnvironment({ ...base, JWT_ACCESS_EXPIRES_IN: value }));
});

test("rate and cookie overrides must be finite positive integers within documented bounds", () => {
  for (const key of ["RATE_LIMIT_MAX", "AUTH_RATE_LIMIT_MAX", "PASSWORD_RESET_REQUEST_MAX", "PASSWORD_RESET_ATTEMPT_MAX", "ACCESS_COOKIE_MAX_AGE_MS", "REFRESH_COOKIE_MAX_AGE_MS"]) {
    for (const value of ["0", "-1", "1.5", "Infinity", "not-a-number", "9007199254740992"])
      assert.throws(() => validateEnvironment({ ...base, [key]: value }), new RegExp(key));
  }
  assert.throws(() => validateEnvironment({ ...base, ACCESS_COOKIE_MAX_AGE_MS: "86400001" }), /ACCESS_COOKIE_MAX_AGE_MS/);
  assert.throws(() => validateEnvironment({ ...base, REFRESH_COOKIE_MAX_AGE_MS: String(366 * 86400000) }), /REFRESH_COOKIE_MAX_AGE_MS/);
});

test("database waits and slow-request thresholds reject unbounded or invalid startup settings", () => {
  for (const key of ["MONGO_SERVER_SELECTION_TIMEOUT_MS", "MONGO_CONNECT_TIMEOUT_MS", "MONGO_SOCKET_TIMEOUT_MS", "MONGO_WAIT_QUEUE_TIMEOUT_MS"]) {
    for (const value of ["999", "120001", "1.5", "Infinity"])
      assert.throws(() => validateEnvironment({ ...base, [key]: value }), new RegExp(key));
    assert.doesNotThrow(() => validateEnvironment({ ...base, [key]: "1000" }));
    assert.doesNotThrow(() => validateEnvironment({ ...base, [key]: "120000" }));
  }
  for (const value of ["99", "60001", "NaN"])
    assert.throws(() => validateEnvironment({ ...base, SLOW_REQUEST_MS: value }), /SLOW_REQUEST_MS/);
});
