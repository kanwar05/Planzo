import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { before, beforeEach, afterEach, after, test } from "node:test";
import { Writable } from "node:stream";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import SupportCase from "../src/models/SupportCase.js";
import SupportCaseEvent from "../src/models/SupportCaseEvent.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import cloudinary from "../src/config/cloudinary.js";
import supportRoutes from "../src/routes/supportCaseRoutes.js";
import evidenceRoutes from "../src/routes/supportEvidenceRoutes.js";
import { errorHandler } from "../src/middleware/errorMiddleware.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { supportEvidenceFileInfo, cleanupSupportEvidence } from "../src/middleware/upload.js";
import { createSupportCase, manageSupportCase, resetSupportCaseRatesForTests } from "../src/services/supportCaseService.js";
import { setSupportEvidenceReaderForTests } from "../src/services/supportEvidenceService.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=", "base64");
const digest = createHash("sha256").update(png).digest("hex");
const app = express();
app.use(express.json()); app.use("/api", evidenceRoutes); app.use("/api", supportRoutes); app.use(errorHandler);
const models = [User, Vendor, Booking, SupportCase, SupportCaseEvent, NotificationOutbox];
const originalUpload = cloudinary.uploader.upload_stream, originalDestroy = cloudinary.uploader.destroy;
const environmentNames = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
const originalEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
let mongo, serial = 0, uploads, destroyed, readerCalls, providerFailure, invalidProviderId, beforeComplete, requiredCompletions, completions;
const auth = actor => `Bearer ${generateAccessToken(actor._id, actor.authVersion || 0)}`;
const route = record => `/api/support/cases/${record._id}/evidence`;
function upload(actor, record, { key = randomUUID(), revision = record.revision, data = png, filename = "evidence.png", contentType = "image/png", field = "evidence", count = 1 } = {}) {
  let operation = request(app).post(route(record)).set("Authorization", auth(actor)).set("Idempotency-Key", key).field("revision", String(revision));
  for (let index = 0; index < count; index += 1) operation = operation.attach(field, data, { filename, contentType });
  return operation;
}
const binary = (response, callback) => {
  const chunks = [];
  response.on("data", chunk => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
};
const download = (actor, record, evidenceId) => request(app).get(`${route(record)}/${evidenceId}`)
  .set("Authorization", auth(actor)).buffer(true).parse(binary);
async function fixture() {
  const [customer, owner, stranger, otherVendor, admin] = await User.insertMany(
    ["customer", "vendor", "customer", "vendor", "admin"].map(role => ({
      name: `Evidence ${role} ${++serial}`, email: `evidence-${serial}@example.test`, phone: "9876543210",
      password: "unused-test-hash", role, emailVerifiedAt: new Date(),
    })));
  const vendor = await Vendor.create({ userId: owner._id, businessName: "Evidence Studio", serviceCategory: "Decoration",
    description: "Event decoration", location: "Delhi", pricing: 1000, verified: true, verificationStatus: "approved" });
  const booking = await Booking.create({ customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
    eventDate: new Date("2099-04-01T00:00:00Z"), eventLocation: "Delhi garden", description: "A garden event" });
  const result = await createSupportCase(String(booking._id), customer, {
    category: "service_quality", subject: "Booking service evidence", description: "Please review the agreed service.",
  }, randomUUID());
  return { customer, owner, stranger, otherVendor, admin, booking, vendor, record: result.case };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "support-evidence-test-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(models.map(model => model.createIndexes()));
});
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  resetSupportCaseRatesForTests();
  uploads = []; destroyed = []; readerCalls = []; completions = [];
  providerFailure = false; invalidProviderId = false; beforeComplete = null; requiredCompletions = 1;
  for (const name of environmentNames) process.env[name] = "evidence-test-placeholder";
  setSupportEvidenceReaderForTests(asset => { readerCalls.push(asset); return png; });
  cloudinary.uploader.destroy = async (publicId, options) => { destroyed.push({ publicId, options }); return { result: "ok" }; };
  cloudinary.uploader.upload_stream = (options, callback) => {
    const metadata = { options, bytes: 0 }; uploads.push(metadata);
    return new Writable({
      write(chunk, encoding, done) { metadata.bytes += chunk.length; done(); },
      final(done) {
        completions.push(async () => {
          try {
            if (beforeComplete) await beforeComplete();
            callback(providerFailure ? new Error("PRIVATE_PROVIDER_ERROR") : null, providerFailure ? undefined : {
              public_id: invalidProviderId ? "foreign/PRIVATE_PROVIDER_REFERENCE" : options.public_id,
              secure_url: `https://res.cloudinary.com/evidence-test/image/authenticated/${options.public_id}.png`,
              bytes: metadata.bytes, format: "png",
            });
          } finally { done(); }
        });
        if (completions.length >= requiredCompletions) {
          const ready = completions.splice(0);
          setImmediate(() => { for (const finish of ready) void finish(); });
        }
      },
    });
  };
});
afterEach(() => {
  cloudinary.uploader.upload_stream = originalUpload; cloudinary.uploader.destroy = originalDestroy;
  setSupportEvidenceReaderForTests(undefined);
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test("evidence uses authenticated original-image storage, server-owned identifiers and original-byte SHA256", async () => {
  const { customer, record } = await fixture();
  const response = await upload(customer, record);
  assert.equal(response.status, 201, response.body.message);
  assert.equal(uploads.length, 1);
  const options = uploads[0].options;
  assert.equal(options.type, "authenticated");
  assert.equal(options.resource_type, "image");
  assert.equal(options.overwrite, false);
  assert.equal(options.timeout, 30000);
  assert.deepEqual(options.allowed_formats, ["jpg", "jpeg", "png", "webp"]);
  assert.equal(options.transformation, undefined);
  assert.match(options.public_id, /^planzo\/support-evidence\/[a-f0-9-]{36}$/);
  assert.doesNotMatch(JSON.stringify(response.body), /publicId|sha256|uploaderId|creationKeyHash|requestKeyHash|res\.cloudinary|PRIVATE_PROVIDER_REFERENCE/);
  assert.equal(response.body.case.evidence[0].bytes, png.length);
  assert.equal(response.body.case.evidence[0].uploaderRole, "customer");
  const stored = await SupportCase.findById(record._id).select("+evidence.publicId +evidence.sha256");
  assert.equal(stored.evidence[0].sha256, digest);
  assert.equal(stored.evidence[0].publicId, options.public_id);
  assert.equal(await SupportCaseEvent.countDocuments({ kind: "evidence_added" }), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 4);
  assert.equal(destroyed.length, 0);
});

test("foreign, unauthenticated and unverified uploads fail before provider writes", async () => {
  const { customer, owner, stranger, otherVendor, record } = await fixture();
  for (const actor of [stranger, otherVendor]) assert.equal((await upload(actor, record)).status, 403);
  assert.equal((await request(app).post(route(record)).set("Idempotency-Key", randomUUID())
    .field("revision", "1").attach("evidence", png, "evidence.png")).status, 401);
  await User.collection.updateOne({ _id: owner._id }, { $set: { emailVerifiedAt: null } });
  assert.equal((await upload(owner, record)).status, 403);
  assert.equal((await upload(customer, { ...record, _id: "invalid" })).status, 400);
  assert.equal(uploads.length, 0); assert.equal(destroyed.length, 0);
});

test("private byte proxy is authenticated and scoped to the case without exposing provider URLs", async () => {
  const { customer, owner, stranger, otherVendor, admin, record } = await fixture();
  const saved = await upload(customer, record);
  const evidenceId = saved.body.case.evidence[0].evidenceId;
  for (const actor of [customer, owner, admin]) {
    const response = await download(actor, record, evidenceId);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, png);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.equal(response.headers["content-type"], "image/png");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.match(response.headers["content-disposition"], new RegExp(`support-evidence-${evidenceId}\\.png`));
    assert.doesNotMatch(JSON.stringify(response.headers), /cloudinary|api_key|signature|public_id/);
  }
  assert.equal(readerCalls.length, 3);
  for (const actor of [stranger, otherVendor]) assert.equal((await download(actor, record, evidenceId)).status, 403);
  assert.equal((await request(app).get(`${route(record)}/${evidenceId}`)).status, 401);
  assert.equal((await download(customer, record, String(new mongoose.Types.ObjectId()))).status, 404);
  assert.equal((await download(customer, record, "invalid")).status, 400);
  const foreign = await fixture();
  assert.equal((await download(customer, foreign.record, evidenceId)).status, 403);
  assert.equal(readerCalls.length, 3);
});

test("same upload key replays the recorded operation without provider writes or duplicate notifications", async () => {
  const { customer, record } = await fixture();
  const key = randomUUID();
  const first = await upload(customer, record, { key });
  const second = await upload(customer, record, { key, revision: 999 });
  assert.equal(first.status, 201); assert.equal(second.status, 200);
  assert.equal(second.body.replayed, true);
  assert.deepEqual(second.body.event.evidenceIds, first.body.event.evidenceIds);
  assert.equal(uploads.length, 1);
  assert.equal(destroyed.length, 0);
  assert.equal(await SupportCaseEvent.countDocuments({ kind: "evidence_added" }), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 4);
});

test("simultaneous duplicate uploads retain one operation and clean only redundant newly owned media", async () => {
  const { customer, record } = await fixture();
  requiredCompletions = 2;
  const key = randomUUID();
  const responses = await Promise.all([upload(customer, record, { key }), upload(customer, record, { key })]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
  assert.equal(uploads.length, 2);
  assert.equal(destroyed.length, 1);
  const stored = await SupportCase.findById(record._id).select("+evidence.publicId");
  assert.equal(stored.evidence.length, 1);
  assert.notEqual(destroyed[0].publicId, stored.evidence[0].publicId);
  assert.ok(uploads.some(row => row.options.public_id === destroyed[0].publicId));
  assert.equal(destroyed[0].options.type, "authenticated");
  assert.equal(await SupportCaseEvent.countDocuments({ kind: "evidence_added" }), 1);
  assert.equal(await NotificationOutbox.countDocuments(), 4);
});

test("stale revisions clean new uploads without deleting or rewriting previously attached evidence", async () => {
  const { customer, record } = await fixture();
  const first = await upload(customer, record);
  assert.equal(first.status, 201);
  const retained = uploads[0].options.public_id;
  const second = await upload(customer, record);
  assert.equal(second.status, 409);
  assert.equal(uploads.length, 2); assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].publicId, uploads[1].options.public_id);
  assert.notEqual(destroyed[0].publicId, retained);
  assert.deepEqual(destroyed[0].options, { resource_type: "image", type: "authenticated", invalidate: true });
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 1);
  assert.equal(await NotificationOutbox.countDocuments(), 4);
});

test("closed cases block new evidence before upload while replay and authorized history remain available", async () => {
  const { customer, owner, admin, record } = await fixture();
  const key = randomUUID();
  let result = await upload(customer, record, { key });
  const evidenceId = result.body.case.evidence[0].evidenceId;
  let managed = await manageSupportCase(record._id, admin, { revision: result.body.case.revision, status: "resolved", resolution: "Case reviewed." });
  managed = await manageSupportCase(record._id, admin, { revision: managed.case.revision, status: "closed" });
  assert.equal((await upload(owner, managed.case)).status, 409);
  assert.equal((await upload(customer, managed.case, { key })).status, 200);
  assert.equal(uploads.length, 1);
  assert.equal((await download(owner, record, evidenceId)).status, 200);
});

test("closure during provider upload rejects the attachment and cleans the new private object", async () => {
  const { customer, admin, record } = await fixture();
  beforeComplete = async () => {
    let update = await manageSupportCase(record._id, admin, { revision: record.revision, status: "resolved", resolution: "Issue reviewed while the upload was pending." });
    await manageSupportCase(record._id, admin, { revision: update.case.revision, status: "closed" });
  };
  const response = await upload(customer, record);
  assert.equal(response.status, 409);
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 0);
  assert.equal(destroyed.length, 1); assert.equal(destroyed[0].options.type, "authenticated");
  assert.equal(await SupportCaseEvent.countDocuments({ kind: "evidence_added" }), 0);
});

test("MIME, extension, multipart fields, file count and size limits reject invalid evidence", async () => {
  const { customer, record } = await fixture();
  for (const options of [{ filename: "receipt.pdf", contentType: "application/pdf" }, { filename: "attack.svg", contentType: "image/svg+xml" },
    { filename: "evidence.png", contentType: "image/jpeg" }, { field: "images" }]) {
    assert.equal((await upload(customer, record, options)).status, 400);
  }
  assert.equal(uploads.length, 0);
  assert.equal((await upload(customer, record, { count: 4 })).status, 400);
  assert.ok(destroyed.every(row => row.options.type === "authenticated"));
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 0);
  const tooLarge = await upload(customer, record, { data: Buffer.alloc(5 * 1024 * 1024 + 1, 1) });
  assert.equal(tooLarge.status, 400);
  assert.match(tooLarge.body.message, /5MB/);
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 0);
});

test("case evidence cap rejects the whole new batch and never deletes retained private media", async () => {
  const { customer, record } = await fixture();
  const retained = Array.from({ length: 19 }, () => ({ evidenceId: new mongoose.Types.ObjectId(),
    publicId: `planzo/support-evidence/${randomUUID()}`, sha256: digest, format: "png", bytes: png.length,
    uploaderId: customer._id, uploaderRole: "customer", createdAt: new Date() }));
  await SupportCase.updateOne({ _id: record._id }, { $set: { evidence: retained } }, { runValidators: true });
  const response = await upload(customer, record, { count: 3 });
  assert.equal(response.status, 409);
  assert.match(response.body.message, /20 evidence/);
  assert.equal(destroyed.length, 3);
  assert.ok(destroyed.every(row => !retained.some(old => old.publicId === row.publicId)));
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 19);
  assert.equal(await SupportCaseEvent.countDocuments({ kind: "evidence_added" }), 0);
});

test("client-supplied provider identifiers cannot attach or delete another asset", async () => {
  const { customer, record } = await fixture();
  const foreign = "planzo/support-evidence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const response = await request(app).post(route(record)).set("Authorization", auth(customer)).set("Idempotency-Key", randomUUID())
    .field("publicId", foreign).attach("evidence", png, "evidence.png");
  assert.equal(response.status, 400);
  assert.ok(destroyed.every(row => row.publicId !== foreign));
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 0);
  const forged = { filename: foreign, publicId: foreign, deliveryType: "authenticated", sha256: digest, format: "png", size: png.length };
  assert.throws(() => supportEvidenceFileInfo(forged), { statusCode: 400 });
  const count = destroyed.length;
  await cleanupSupportEvidence([forged]);
  assert.equal(destroyed.length, count);
});

test("provider failures and invalid returned identifiers fail safely and clean only the server nonce", async () => {
  const { customer, record } = await fixture();
  providerFailure = true;
  let response = await upload(customer, record);
  assert.equal(response.status, 502);
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_PROVIDER_ERROR/);
  providerFailure = false; invalidProviderId = true;
  response = await upload(customer, record);
  assert.equal(response.status, 502);
  assert.equal(destroyed.length, 2);
  assert.ok(destroyed.every(row => uploads.some(uploaded => uploaded.options.public_id === row.publicId) && row.options.type === "authenticated"));
  assert.ok(destroyed.every(row => row.publicId !== "foreign/PRIVATE_PROVIDER_REFERENCE"));
  assert.equal((await SupportCase.findById(record._id)).evidence.length, 0);
  assert.equal(await SupportCaseEvent.countDocuments({ kind: "evidence_added" }), 0);
});

test("evidence reader failures do not expose signed URLs, provider errors or account data", async () => {
  const { customer, record } = await fixture();
  const uploaded = await upload(customer, record);
  const evidenceId = uploaded.body.case.evidence[0].evidenceId;
  setSupportEvidenceReaderForTests(() => { throw new Error("PRIVATE_SIGNED_URL?api_secret=PRIVATE_KEY"); });
  const response = await download(customer, record, evidenceId);
  assert.equal(response.status, 502);
  assert.doesNotMatch(response.body.toString("utf8"), /PRIVATE_SIGNED_URL|PRIVATE_KEY|api_secret/i);
});
