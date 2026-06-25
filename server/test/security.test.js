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
    response = await request(app).post("/api/auth/register").send({});
  }

  assert.equal(response.status, 429);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.message,
    "Too many requests. Please try again later.",
  );
});
