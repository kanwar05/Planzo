import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import app from "../src/app.js";

test("CORS allows the configured frontend origin", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "http://localhost:5173");

  assert.equal(response.status, 200);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://localhost:5173",
  );
});

test("CORS rejects unknown browser origins", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://malicious.example.com");

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, "This origin is not allowed by CORS.");
});

test("auth endpoints return a clean response when rate limited", async () => {
  let response;

  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await request(app)
      .post("/api/auth/register")
      .set("x-enable-rate-limit-test", "true")
      .send({});
  }

  assert.equal(response.status, 429);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.message,
    "Too many requests. Please try again later.",
  );
});

test("removed integrations no longer expose API endpoints", async () => {
  for (const endpoint of ["payments", "chat", "calendar", "favorites", "notifications", "reviews", "settings", "analytics"]) {
    const response = await request(app).get(`/api/${endpoint}`);
    assert.equal(response.status, 404, endpoint);
  }
});

test("cross-site requests without a trusted Origin cannot mutate accounts", async () => {
  const response = await request(app).post("/api/auth/logout").set("Sec-Fetch-Site", "cross-site");
  assert.equal(response.status, 403);
  assert.match(response.body.message, /Origin/);
});

test("production cookie mutations require an allowed Origin", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const denied = await request(app).post("/api/auth/logout").set("Cookie", "eventifyy_access=sample");
    assert.equal(denied.status, 403);
    const allowed = await request(app).post("/api/auth/logout").set("Origin", "http://localhost:5173");
    assert.equal(allowed.status, 200);
  } finally { process.env.NODE_ENV = previous; }
});

test("malformed and oversized JSON fail with safe errors", async () => {
  const malformed = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send('{"email":');
  assert.equal(malformed.status, 400);
  assert.match(malformed.body.message, /invalid JSON/);
  const oversized = await request(app).post("/api/auth/login").send({ email: "a".repeat(110000) });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.message, "Request body is too large.");
});
