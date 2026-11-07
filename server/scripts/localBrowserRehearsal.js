import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createLocalSmtpCapture } from "./localSmtpCapture.js";
import { openLocalChrome, safeBrowserEvidence } from "../../scripts/staging-browser-cdp.mjs";
import { runBrowserJourney } from "../../scripts/staging-browser-journey.mjs";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.dirname(serverRoot);
const frontend = path.join(workspace, "frontend");
const cacheRoot = path.join(workspace, ".cache", "staging-browser");
const runId = randomUUID();
let phase = "initialization";
let mongo, mongoose, smtp, transport, http, vite, browser, runDirectory;
let cleanupPromise;
let evidence;
async function boundedCleanup(operation) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("cleanup_deadline")), 7000); }),
    ]);
  } finally { clearTimeout(timer); }
}
async function cleanup() {
  cleanupPromise ||= (async () => {
    const results = await Promise.allSettled([
      () => browser?.close(), () => vite?.close(),
      async () => { if (http) { http.closeAllConnections(); await new Promise((resolve) => http.close(resolve)); } },
      () => transport?.close(), () => smtp?.close(),
      () => mongoose?.disconnect(), () => mongo?.stop(),
    ].map(boundedCleanup));
    if (runDirectory) {
      if (!path.resolve(runDirectory).startsWith(path.resolve(cacheRoot) + path.sep)) throw new Error("unsafe_rehearsal_cleanup");
      rmSync(runDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
    if (results.some((result) => result.status === "rejected")) throw new Error("cleanup_failed");
  })();
  return cleanupPromise;
}
const watchdog = setTimeout(() => {
  console.log(JSON.stringify({ event: "local_browser_rehearsal", runId, scope: "local", success: false, category: "deadline_exceeded" }));
  setTimeout(() => process.exit(1), 10000);
  cleanup().then(() => process.exit(1), () => process.exit(1));
}, 180000);
watchdog.unref();

async function freePort() {
  const allocator = createServer();
  await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
  const port = allocator.address().port;
  await new Promise((resolve) => allocator.close(resolve));
  return port;
}

try {
  if (process.argv.length > 2) throw new Error("no_external_targets_accepted");
  // Never load .env. Remove inherited provider/database pins and replace every
  // service credential/address before importing the application or its models.
  for (const key of Object.keys(process.env)) if (
    key.startsWith("STAGING_") || key.startsWith("SMTP_") || key.startsWith("CLOUDINARY_") ||
    ["APP_ENV", "MONGODB_URI", "CLIENT_URL", "JWT_SECRET", "OTP_HMAC_SECRET"].includes(key)
  ) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test", JWT_SECRET: randomBytes(48).toString("hex"),
    OTP_HMAC_SECRET: randomBytes(48).toString("hex"), TRUST_PROXY: "0", COOKIE_SAME_SITE: "lax",
    CLOUDINARY_CLOUD_NAME: "isolated-local-fixture", CLOUDINARY_API_KEY: "isolated-local-fixture",
    CLOUDINARY_API_SECRET: "isolated-local-fixture", SMTP_FROM_EMAIL: "planzo@example.invalid",
    MONGOMS_DOWNLOAD_DIR: path.join(serverRoot, ".cache", "mongodb"),
  });
  const accounts = Object.fromEntries(["admin", "vendor", "customer"].map((role) => [role, {
    role, name: `Local ${role}`, email: `${role}-${runId}@example.invalid`,
    password: randomBytes(18).toString("base64url") + "Aa1!",
  }]));
  mkdirSync(cacheRoot, { recursive: true });
  runDirectory = mkdtempSync(path.join(cacheRoot, "fixture-"));
  const imageFile = path.join(runDirectory, "portfolio.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=", "base64");
  writeFileSync(imageFile, png);
  phase = "isolated_database";
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  mongoose = (await import("mongoose")).default;
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, dbName: "planzo_local_staging_rehearsal" } });
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
  const frontendPort = await freePort();
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  process.env.CLIENT_URL = frontendOrigin;
  phase = "loopback_smtp";
  smtp = await createLocalSmtpCapture(Object.values(accounts).map((account) => account.email));
  Object.assign(process.env, { SMTP_HOST: smtp.host, SMTP_PORT: String(smtp.port), SMTP_SECURE: "false" });
  const nodemailer = (await import("nodemailer")).default;
  transport = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: false, ignoreTLS: true,
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000 });
  const send = (message) => transport.sendMail({ from: process.env.SMTP_FROM_EMAIL, ...message });
  (await import("../src/services/accountEmailService.js")).setAccountEmailSenderForTests(send);
  (await import("../src/services/otpEmailService.js")).setOtpEmailSenderForTests(send);
  (await import("../src/services/bookingEmailService.js")).setBookingEmailSenderForTests(send);
  const cloudinary = (await import("../src/config/cloudinary.js")).default;
  const { Writable } = await import("node:stream");
  cloudinary.uploader.upload_stream = (options, callback) => new Writable({
    write(chunk, encoding, done) { done(); },
    final(done) { callback(null, { public_id: options.public_id, secure_url: "https://assets.staging.invalid/local-rehearsal.png", bytes: png.length }); done(); },
  });
  cloudinary.uploader.destroy = async () => ({ result: "ok" });
  phase = "actual_http_api";
  const app = (await import("../src/app.js")).default;
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  const User = (await import("../src/models/User.js")).default;
  await User.create({ ...accounts.admin, phone: "9876543212" });
  http = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => http.once("listening", resolve));
  const apiOrigin = `http://127.0.0.1:${http.address().port}`;
  phase = "actual_react_frontend";
  const frontendRequire = createRequire(path.join(frontend, "package.json"));
  const viteModule = await import(pathToFileURL(path.join(frontend, "node_modules", "vite", "dist", "node", "index.js")).href);
  const reactModule = await import(pathToFileURL(frontendRequire.resolve("@vitejs/plugin-react")).href);
  const react = reactModule.default?.default || reactModule.default;
  // Tailwind's existing relative content/config paths resolve from the frontend.
  // Vite's envDir below remains the empty disposable fixture directory.
  process.chdir(frontend);
  vite = await viteModule.createServer({ root: frontend, configFile: false, envDir: runDirectory,
    envPrefix: "PLANZO_LOCAL_REHEARSAL_PUBLIC_", logLevel: "error", plugins: [react()],
    define: { "import.meta.env.VITE_API_URL": JSON.stringify(apiOrigin + "/api") },
    server: { host: "127.0.0.1", port: frontendPort, strictPort: true },
  });
  await vite.listen();
  const { dispatchBookingEmailBatch } = await import("../src/services/bookingEmailDispatcher.js");
  const Booking = (await import("../src/models/Booking.js")).default;
  const NotificationOutbox = (await import("../src/models/NotificationOutbox.js")).default;
  const emailBatches = [];
  phase = "actual_chrome_workflow";
  browser = await openLocalChrome({ frontendOrigin, apiOrigin, cacheRoot });
  const result = await runBrowserJourney({
    browser, apiOrigin, accounts, runId, imageFile,
    progress: (check) => console.log(JSON.stringify({ event: "local_browser_check", runId, ...check })),
    async mail(recipient, subject) {
      for (let index = 0; index < 100; index += 1) {
        const found = [...smtp.messages].reverse().find((message) => message.to.includes(recipient.toLowerCase()) && message.subject === subject);
        if (found) {
          if (/^Planzo booking/.test(subject)) {
            const role = recipient === accounts.customer.email ? "customer" : "vendor";
            if (!/Content-Type: text\/plain/i.test(found.raw) || !/Content-Type: text\/html/i.test(found.raw) ||
                !found.decoded.includes(`${frontendOrigin}/${role}/dashboard`)) throw new Error("local_mail_format_or_link_failed");
          }
          return found;
        }
        await delay(50);
      }
      throw new Error("local_receipt_missing");
    },
    async flushEmail() {
      const began = performance.now();
      const result = await dispatchBookingEmailBatch({ limit: 25, logger: { warn() {} } });
      emailBatches.push({ ...result, durationMs: Math.round(performance.now() - began) });
      if (result.failed || result.stale) throw new Error("local_dispatch_failed");
    },
    async verifyDatabase({ vendorId }) {
      const statuses = await Booking.aggregate([{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
      const counts = Object.fromEntries(statuses.map((status) => [status._id, status.count]));
      const pendingEmails = await NotificationOutbox.countDocuments({ status: { $in: ["pending", "processing"] } });
      const failedEmails = await NotificationOutbox.countDocuments({ status: "failed" });
      const sentEmails = await NotificationOutbox.countDocuments({ status: "sent" });
      const auditRecords = await mongoose.connection.collection("vendormoderationaudits").countDocuments();
      const bookingReceipts = smtp.messages.filter((message) => /^Planzo booking/.test(message.subject)).length;
      if (sentEmails !== bookingReceipts) throw new Error("local_receipt_count_mismatch");
      return { ...counts, pendingEmails, failedEmails, sentEmails, bookingReceipts, auditRecords };
    },
  });
  evidence = safeBrowserEvidence(runId, result.checks, { ...result.metrics, emailBatches, smtpReceipts: smtp.messages.length, cloudinary: "MOCKED", runtime: "development_frontend_test_api", browserVersion: browser.version, nodeVersion: process.version });
  if (result.checks.some((check) => check.status !== "pass")) process.exitCode = 1;
} catch (error) {
  const failure = /^[a-z_]{1,60}$/.test(error?.message || "") ? error.message : "operation_failed";
  console.error(JSON.stringify({ event: "local_browser_rehearsal", runId, scope: "local", success: false, category: "local_rehearsal_failed", failure, phase }));
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  const cleanupDeadline = setTimeout(() => {
    console.error(JSON.stringify({ event: "local_browser_rehearsal", runId, success: false, category: "cleanup_deadline" }));
    process.exit(1);
  }, 12000);
  try { await cleanup(); } catch {
    cleanupFailed = true;
    console.error(JSON.stringify({ event: "local_browser_rehearsal", runId, success: false, category: "cleanup_failed" }));
    process.exitCode = 1;
  }
  if (!cleanupFailed) clearTimeout(cleanupDeadline);
  clearTimeout(watchdog);
  if (evidence) console.log(JSON.stringify({ ...evidence, success: evidence.success && !process.exitCode }));
}
