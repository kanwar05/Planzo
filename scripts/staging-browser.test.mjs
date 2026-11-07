import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { localOrigin, safeBrowserEvidence } from "./staging-browser-cdp.mjs";
import { createLocalSmtpCapture } from "../server/scripts/localSmtpCapture.js";

const requireServer = createRequire(new URL("../server/package.json", import.meta.url));

test("browser targets stay on loopback and evidence excludes arbitrary account fields", () => {
  assert.equal(localOrigin("http://127.0.0.1:5123"), "http://127.0.0.1:5123");
  for (const value of ["https://production.example.invalid", "https://staging.example.invalid", "http://127.0.0.1.example.invalid", "http://username:password@localhost", "file:///private"])
    assert.throws(() => localOrigin(value));
  const result = safeBrowserEvidence("synthetic-run", [{ name: "fixed_check", status: "pass", password: "private-sentinel" }]);
  assert.equal(result.apiMocking, false);
  assert.equal(result.secureCrossSiteCookies, "PENDING");
  assert.equal(result.firefox, "PENDING");
  assert.equal(result.safari, "PENDING");
  assert.equal(JSON.stringify(result).includes("private-sentinel"), false);
  assert.equal(safeBrowserEvidence("synthetic-run", []).success, false);
});

test("the loopback SMTP sink captures actual SMTP content and refuses every unapproved recipient", async () => {
  const sink = await createLocalSmtpCapture(["qa@example.invalid"]);
  const nodemailer = requireServer("nodemailer");
  const transport = nodemailer.createTransport({ host: sink.host, port: sink.port, secure: false, ignoreTLS: true,
    connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 2000 });
  try {
    const info = await transport.sendMail({ from: "sender@example.invalid", to: "qa@example.invalid", subject: "Local SMTP check", text: "Synthetic local receipt", html: "<p>Synthetic local receipt</p>" });
    assert.deepEqual(info.accepted, ["qa@example.invalid"]);
    assert.equal(sink.host, "127.0.0.1");
    assert.equal(sink.messages.length, 1);
    assert.equal(sink.messages[0].subject, "Local SMTP check");
    assert.match(sink.messages[0].raw, /Content-Type: text\/plain/);
    assert.match(sink.messages[0].raw, /Content-Type: text\/html/);
    await assert.rejects(transport.sendMail({ from: "sender@example.invalid", to: "refused@example.invalid", subject: "Refused", text: "Never accepted" }));
    assert.equal(sink.messages.length, 1);
  } finally { transport.close(); await sink.close(); }
});

test("the real-stack browser CLI refuses external target arguments before starting services", () => {
  const result = spawnSync(process.execPath, ["server/scripts/localBrowserRehearsal.js", "--url=https://production.example.invalid"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 5000,
    env: { ...process.env, MONGODB_URI: "PRIVATE_APPLICATION_URI_MUST_NOT_BE_USED" },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.failure, "no_external_targets_accepted");
  assert.equal(report.success, false);
  assert.equal(report.phase, "initialization");
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_APPLICATION_URI|production\.example/);
});
