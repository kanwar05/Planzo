import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { MongoMemoryServer } from "mongodb-memory-server";

test("production entry point starts with only MVP configuration and serves health", { timeout: 30000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  const allocator = createServer();
  allocator.listen(0, "127.0.0.1");
  await once(allocator, "listening");
  const port = allocator.address().port;
  await new Promise((resolve) => allocator.close(resolve));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env, NODE_ENV: "production", PORT: String(port),
      MONGODB_URI: mongo.getUri(), JWT_SECRET: "startup-test-secret-with-at-least-32-characters",
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
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 15000);
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("Planzo API listening")) { clearTimeout(timer); resolve(); }
      });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Startup exited ${code}: ${output}`)); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, "Planzo API is running.");
    assert.equal(response.headers.get("x-powered-by"), null);
  } finally {
    const exited = once(child, "exit").catch(() => {});
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
    await mongo.stop();
  }
});
