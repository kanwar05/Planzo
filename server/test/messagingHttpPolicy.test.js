import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX = "1";
process.env.MESSAGING_HTTP_RATE_LIMIT_MAX = "10";
const { default: app } = await import("../src/app.js");
const bookingId = "1234567890abcdef12345678";

test("messaging history, counts and receipts retain their own IP budget before authentication", async () => {
  for (const route of [`/api/bookings/${bookingId}/messages`, `/api/bookings/${bookingId}/conversation`, "/api/conversations/unread"]) {
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const response = await request(app).get(route).set("x-enable-rate-limit-test", "true");
      assert.equal(response.status, 401);
    }
  }
  const receipt = await request(app).patch(`/api/bookings/${bookingId}/conversation/read`)
    .set("x-enable-rate-limit-test", "true").send({ throughSequence: 0 });
  assert.equal(receipt.status, 401);
});

test("unrelated APIs keep their original IP limit and the messaging limit still has a ceiling", async () => {
  assert.equal((await request(app).get("/api/not-a-route").set("x-enable-rate-limit-test", "true")).status, 404);
  assert.equal((await request(app).get("/api/not-a-route").set("x-enable-rate-limit-test", "true")).status, 429);
  let last;
  for (let repeat = 0; repeat < 4; repeat += 1)
    last = await request(app).get(`/api/bookings/${bookingId}/messages`).set("x-enable-rate-limit-test", "true");
  assert.equal(last.status, 429);
});
