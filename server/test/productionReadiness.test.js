import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import app from "../src/app.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import { requestLogging } from "../src/middleware/requestLogging.js";
import { createReadinessHandler } from "../src/services/readinessService.js";
import { errorCategory, logEvent } from "../src/utils/logger.js";

function readinessApp(connection, options = {}) {
  const instance = express();
  instance.get("/ready", createReadinessHandler({ connection, logger() {}, ...options }));
  return instance;
}
const connected = (command) => ({ readyState: 1, db: { admin: () => ({ command }) } });

test("readiness checks the primary database without SMTP and reports only a safe contract", async () => {
  const instance = readinessApp(connected(async (command, options) => {
    assert.deepEqual(command, { ping: 1 });
    assert.equal(options.readPreference, "primary");
    assert.equal(options.maxTimeMS, 1000);
    assert.equal(options.timeoutMS, undefined);
    return { ok: 1 };
  }));
  const ready = await request(instance).get("/ready");
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body, { success: true, message: "Planzo API is ready." });
  assert.equal(ready.headers["cache-control"], "no-store");
  instance.locals.shuttingDown = true;
  assert.equal((await request(instance).get("/ready")).status, 503);
});

test("readiness becomes unavailable on connection interruption and recovers after reconnection", async () => {
  let unavailable = false;
  const connection = connected(async () => { if (unavailable) throw new Error(["mongodb://", "private", ":", "secret", "@host/user@example.com"].join("")); });
  const instance = readinessApp(connection);
  assert.equal((await request(instance).get("/ready")).status, 200);
  unavailable = true;
  const failed = await request(instance).get("/ready");
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.body, { success: false, message: "Planzo API is not ready." });
  connection.readyState = 0;
  assert.equal((await request(instance).get("/ready")).status, 503);
  connection.readyState = 1;
  unavailable = false;
  assert.equal((await request(instance).get("/ready")).status, 200);
  assert.equal((await request(app).get("/api/health/live")).status, 200);
});

test("readiness deadlines bound probes and concurrent probes share the underlying operation", async () => {
  let calls = 0;
  let finish;
  const instance = readinessApp(connected(() => { calls++; return new Promise((resolve) => { finish = resolve; }); }), { timeoutMs: 30 });
  const probes = await Promise.all(Array.from({ length: 4 }, () => request(instance).get("/ready")));
  assert.ok(probes.every((response) => response.status === 503));
  assert.equal(calls, 1);
  assert.equal((await request(instance).get("/ready")).status, 503);
  assert.equal(calls, 1, "timed-out HTTP probes must not create more pending DB operations");
  finish();
});

test("production rejects HTTP and untrusted forwarded protocol while permitting internal health probes", async () => {
  const previous = process.env.NODE_ENV;
  const trust = app.get("trust proxy");
  process.env.NODE_ENV = "production";
  try {
    app.set("trust proxy", 0);
    assert.equal((await request(app).post("/api/auth/logout").set("X-Forwarded-Proto", "https")).status, 426);
    assert.equal((await request(app).get("/api/health")).status, 200);
    app.set("trust proxy", 1);
    assert.equal((await request(app).post("/api/auth/logout").set("X-Forwarded-Proto", "https").set("Origin", "http://localhost:5173")).status, 200);
  } finally { process.env.NODE_ENV = previous; app.set("trust proxy", trust); }
});

test("production errors with provider status codes and validation values do not leak secrets", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const instance = express();
  instance.get("/provider/:status", (req) => { const error = new Error("private@example.com smtp://secret"); error.statusCode = Number(req.params.status); error.errors = { secret: "private" }; throw error; });
  instance.get("/validation", () => { const error = new Error("private"); error.name = "ValidationError"; error.errors = { email: { message: "private@example.com" } }; throw error; });
  instance.use(errorHandler);
  try {
    const provider = await request(instance).get("/provider/502");
    assert.equal(provider.status, 502);
    assert.deepEqual(provider.body, { success: false, message: "Internal server error." });
    const invalid = await request(instance).get("/provider/400");
    assert.deepEqual(invalid.body, { success: false, message: "Request could not be processed." });
    const validation = await request(instance).get("/validation");
    assert.equal(validation.status, 400);
    assert.deepEqual(validation.body.errors, { email: "Invalid value." });
  } finally { process.env.NODE_ENV = previous; }
});

test("structured request and error logs omit PII, tokens, query strings, paths and arbitrary fields", async () => {
  const previous = process.env.NODE_ENV;
  const lines = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  process.env.NODE_ENV = "production";
  console.log = console.warn = console.error = (line) => lines.push(JSON.parse(line));
  const instance = express();
  instance.use(requestLogging);
  instance.get("/resource/:id", (req, res) => res.json({ success: true }));
  try {
    const response = await request(instance).get("/resource/private@example.com?token=TOP_SECRET").set("Cookie", "eventifyy_access=TOP_SECRET").set("X-Request-Id", "forged");
    assert.match(response.headers["x-request-id"], /^[a-f0-9-]{36}$/);
    logEvent("error", "operator_event", { recipientEmail: "private@example.com", password: "TOP_SECRET", error: new Error("TOP_SECRET"), category: "database_unavailable" });
    assert.equal(lines[0].route, "/resource/:id");
    assert.equal(lines[0].requestId, response.headers["x-request-id"]);
    assert.equal(lines[1].category, "database_unavailable");
    assert.doesNotMatch(JSON.stringify(lines), /private@example.com|TOP_SECRET|forged|recipientEmail|password/);
  } finally { Object.assign(console, saved); process.env.NODE_ENV = previous; }
});

test("not-found responses do not echo sensitive URLs and correlation IDs are exposed to allowed browsers", async () => {
  const response = await request(app).get("/private@example.com?token=TOP_SECRET").set("Origin", "http://localhost:5173");
  assert.equal(response.status, 404);
  assert.equal(response.body.message, "Route not found.");
  assert.doesNotMatch(response.body.message, /TOP_SECRET|private/);
  assert.equal(response.headers["access-control-expose-headers"], "X-Request-Id");
});

test("error classification tolerates malformed provider hooks without losing the original error", () => {
  assert.equal(errorCategory({ hasErrorLabel: "not a function" }), "operation_failed");
  assert.equal(errorCategory({ hasErrorLabel() { throw new Error("Private provider reply"); } }), "operation_failed");
  assert.equal(errorCategory({ hasErrorLabel: (label) => label === "TransientTransactionError" }), "transaction_transient");
});
