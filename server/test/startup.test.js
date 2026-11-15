import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import mongoose from "mongoose";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";

const replicaSet = () => MongoMemoryReplSet.create({ replSet: { count: 1 } });

async function unusedPort() {
  const allocator = createServer();
  allocator.listen(0, "127.0.0.1");
  await once(allocator, "listening");
  const port = allocator.address().port;
  await new Promise((resolve) => allocator.close(resolve));
  return port;
}

function startApi(uri, port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env, NODE_ENV: "production", PORT: String(port),
      MONGODB_URI: uri, JWT_SECRET: "startup-test-secret-with-at-least-32-characters",
      CLIENT_URL: "https://planzo.example", TRUST_PROXY: "0", COOKIE_SAME_SITE: "none",
      SMTP_HOST: "smtp.example.invalid", SMTP_FROM: "Planzo <accounts@example.invalid>",
      SMTP_FROM_EMAIL: "accounts@example.invalid", SMTP_PORT: "465", SMTP_USER: "mailer@example.invalid",
      SMTP_APP_PASSWORD: "app-password", SMTP_PASS: "", SMTP_SECURE: "true",
      OTP_HMAC_SECRET: "startup-otp-secret-with-at-least-32-characters",
      CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
  return { child, exited, output: () => output };
}

async function stopApi(api) {
  if (api.child.exitCode === null && api.child.signalCode === null)
    api.child.kill();
  await api.exited;
}

async function deadline(operation, message) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message())), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function assertStartupRefused(uri, expectedMessage) {
  const api = startApi(uri, await unusedPort());
  try {
    const result = await deadline(api.exited, () => `Startup did not refuse unsafe data: ${api.output()}`);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, expectedMessage);
    assert.doesNotMatch(result.output, /Planzo API listening/);
  } finally {
    await stopApi(api);
  }
}

test("production entry point starts with only MVP configuration and serves health", { timeout: 30000 }, async () => {
  const mongo = await replicaSet();
  const port = await unusedPort();
  const api = startApi(mongo.getUri(), port);
  try {
    await deadline(new Promise((resolve, reject) => {
      api.child.stdout.on("data", (chunk) => {
        if (api.output().includes("Planzo API listening")) resolve();
      });
      api.exited.then(({ code, output }) => reject(new Error(`Startup exited ${code}: ${output}`)), reject);
    }), () => `Startup timed out: ${api.output()}`);
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, "Planzo API is running.");
    assert.equal(response.headers.get("x-powered-by"), null);
  } finally {
    await stopApi(api);
    await mongo.stop();
  }
});

test("startup refuses standalone MongoDB before listening", { timeout: 30000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(mongo.getUri(), { autoIndex: false }).asPromise();
  try {
    const bookings = connection.collection("bookings");
    await bookings.insertOne({
      vendorId: new mongoose.Types.ObjectId(), eventDate: new Date("2027-04-10T00:00:00.000Z"),
      eventDateOnly: "2027-04-10", status: "pending", legacyValue: "preserve",
    });
    const before = await bookings.find().toArray();
    await assertStartupRefused(mongo.getUri(), /requires a MongoDB replica set/);
    assert.deepEqual(await bookings.find().toArray(), before);
  } finally {
    await connection.close();
    await mongo.stop();
  }
});

for (const scenario of [
  {
    name: "a unique reservation with a mismatched nonempty date key",
    expectedMessage: /Booking date migration is required/,
    records: (vendorId) => [{
      vendorId, eventDate: new Date("2027-04-10T00:00:00.000Z"),
      eventDateOnly: "2027-04-11", status: "accepted", legacyValue: "preserve",
    }],
  },
  {
    name: "duplicate canonical reservations",
    expectedMessage: /E11000|duplicate key/,
    records: (vendorId) => [
      { vendorId, eventDate: new Date("2027-04-10T00:00:00.000Z"), eventDateOnly: "2027-04-10", status: "accepted" },
      { vendorId, eventDate: new Date("2027-04-10T08:00:00.000Z"), eventDateOnly: "2027-04-10", status: "completed" },
    ],
  },
]) {
  test(`startup refuses ${scenario.name} without modifying records`, { timeout: 30000 }, async () => {
    const mongo = await replicaSet();
    const connection = await mongoose.createConnection(mongo.getUri(), { autoIndex: false }).asPromise();
    try {
      const bookings = connection.collection("bookings");
      await bookings.insertMany(scenario.records(new mongoose.Types.ObjectId()));
      const before = await bookings.find().sort({ _id: 1 }).toArray();
      await assertStartupRefused(mongo.getUri(), scenario.expectedMessage);
      assert.deepEqual(await bookings.find().sort({ _id: 1 }).toArray(), before);
      const indexes = await bookings.indexes();
      assert.equal(indexes.some((index) => index.name === "one_confirmed_booking_per_vendor_date"), false);
    } finally {
      await connection.close();
      await mongo.stop();
    }
  });
}
