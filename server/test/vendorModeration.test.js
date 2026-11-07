import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import VendorModerationAudit from "../src/models/VendorModerationAudit.js";
import RefreshToken from "../src/models/RefreshToken.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
const auth = (user) => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
async function user(role = "vendor") {
  sequence += 1;
  return User.create({ name: `Account ${sequence}`, email: `private-${sequence}@example.com`,
    phone: "9876543210", password: "PlanzoSecure123!", role });
}
const profile = (owner, extra = {}) => Vendor.create({
  userId: owner._id, businessName: "Bright Events", serviceCategory: "Decoration",
  description: "Event decoration for weddings.", pricing: 10000, location: "Delhi",
  servicesOffered: ["Wedding decor"], ...extra,
});
const review = (admin, vendor, action = "verify", body = {}) => request(app)
  .patch(`/api/admin/vendors/${vendor._id}/${action}`).set("Authorization", auth(admin)).send(body);
const suspend = (admin, vendor, suspended, extra = {}) => request(app)
  .patch(`/api/admin/vendors/${vendor._id}/suspension`).set("Authorization", auth(admin))
  .send({ suspended, reason: "Repeated listing violations.", ...extra });
const stored = (vendor) => Vendor.findById(vendor._id).select("+profileRevision").lean();

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "vendor-moderation-test-secret-with-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), VendorModerationAudit.init(), RefreshToken.init()]);
});
beforeEach(async () => {
  mock.restoreAll();
  await Promise.all([User.deleteMany({}), Vendor.deleteMany({}), VendorModerationAudit.deleteMany({}), RefreshToken.deleteMany({})]);
});
after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("only admins can inspect, approve, reject, suspend or read moderation history", async () => {
  const [owner, customer] = await Promise.all([user(), user("customer")]);
  const vendor = await profile(owner);
  for (const actor of [owner, customer]) {
    assert.equal((await request(app).get("/api/admin/vendors").set("Authorization", auth(actor))).status, 403);
    assert.equal((await review(actor, vendor)).status, 403);
    assert.equal((await review(actor, vendor, "reject", { reason: "Self moderation" })).status, 403);
    assert.equal((await suspend(actor, vendor, true)).status, 403);
    assert.equal((await request(app).get(`/api/admin/vendors/${vendor._id}/audit`).set("Authorization", auth(actor))).status, 403);
  }
  assert.equal(await VendorModerationAudit.countDocuments(), 0);
  assert.equal((await stored(vendor)).verificationStatus, "pending");
});

test("incomplete profiles cannot be approved and failed review leaves no audit or guard change", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner);
  await Vendor.collection.updateOne({ _id: vendor._id }, { $set: { description: "" } });
  const before = await User.findById(owner._id).select("+bookingGuardRevision").lean();
  assert.equal((await review(admin, vendor, "verify", { profileRevision: 0 })).status, 400);
  assert.equal((await stored(vendor)).verificationStatus, "pending");
  assert.deepEqual(await User.findById(owner._id).select("+bookingGuardRevision").lean(), before);
  assert.equal(await VendorModerationAudit.countDocuments(), 0);
});

test("approval records one minimal audit and repeated approval is unchanged", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner, { contactDetails: { email: "business@example.com", phone: "8888888888" } });
  const result = await review(admin, vendor, "verify", { profileRevision: 0 });
  assert.equal(result.status, 200, result.body.message);
  assert.equal(result.body.vendor.profileRevision, 1);
  assert.equal(result.body.vendor.profileCompletion.readyForReview, true);
  const before = await stored(vendor);
  assert.equal((await review(admin, vendor, "verify", { profileRevision: 0 })).status, 200);
  assert.deepEqual(await stored(vendor), before);
  const records = await VendorModerationAudit.find().lean();
  assert.equal(records.length, 1);
  assert.equal(records[0].action, "approve");
  assert.equal(String(records[0].actorId), String(admin._id));
  assert.equal(String(records[0].targetUserId), String(owner._id));
  assert.equal(records[0].fromState, "pending");
  assert.equal(records[0].toState, "approved");
  assert.equal(records[0].profileRevision, 1);
  const history = await request(app).get(`/api/admin/vendors/${vendor._id}/audit`).set("Authorization", auth(admin));
  assert.equal(history.status, 200);
  assert.equal(history.body.records[0].actorId.name, admin.name);
  assert.doesNotMatch(JSON.stringify(history.body), /private-|business@example|8888888888|password|authVersion/);
  const publicProfile = await request(app).get(`/api/vendors/${vendor._id}`);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.vendor.profileRevision, undefined);
  assert.equal(publicProfile.body.vendor.contactDetails, undefined);
});

test("rejected vendors can correct and resubmit, while stale inspected versions cannot be approved", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner);
  const rejection = await review(admin, vendor, "reject", { reason: "Describe your business clearly.", profileRevision: 0 });
  assert.equal(rejection.status, 200);
  const edited = await request(app).patch("/api/vendors/profile").set("Authorization", auth(owner))
    .send({ description: "Detailed decoration service for wedding celebrations.", profileRevision: 1 });
  assert.equal(edited.status, 200, edited.body.message);
  assert.equal(edited.body.vendor.verificationStatus, "pending");
  assert.equal(edited.body.vendor.verificationRejectionReason, "");
  assert.equal((await review(admin, vendor, "verify", { profileRevision: 1 })).status, 409);
  assert.equal(await VendorModerationAudit.countDocuments(), 1);
  assert.equal((await review(admin, vendor, "verify", { profileRevision: edited.body.vendor.profileRevision })).status, 200);
  assert.equal(await VendorModerationAudit.countDocuments(), 2);
});

test("a profile edit racing legacy approval cannot publish unreviewed material changes", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner);
  const original = Vendor.findById;
  let entered;
  let release;
  let held = false;
  const reached = new Promise((resolve) => { entered = resolve; });
  const barrier = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(release, 5000);
  const stub = mock.method(Vendor, "findById", function (...args) {
    const query = original.apply(this, args);
    const execute = query.exec.bind(query);
    query.exec = async (...executionArgs) => {
      const result = await execute(...executionArgs);
      if (!held && String(args[0]) === String(vendor._id)) {
        held = true;
        entered();
        await barrier;
      }
      return result;
    };
    return query;
  });
  try {
    const deciding = review(admin, vendor).then((response) => response);
    await reached;
    const edited = await request(app).patch("/api/vendors/profile").set("Authorization", auth(owner))
      .send({ description: "A materially changed profile submitted during review.", profileRevision: 0 });
    assert.equal(edited.status, 200, edited.body.message);
    release();
    assert.equal((await deciding).status, 409);
    assert.equal((await stored(vendor)).verificationStatus, "pending");
    assert.equal(await VendorModerationAudit.countDocuments(), 0);
  } finally { release(); clearTimeout(timer); stub.mock.restore(); }
});

test("concurrent opposing moderation decisions commit one revision and one audit", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner);
  const results = await Promise.all([
    review(admin, vendor, "verify", { profileRevision: 0 }),
    review(admin, vendor, "reject", { profileRevision: 0, reason: "Review corrections required." }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await stored(vendor)).profileRevision, 1);
  assert.equal(await VendorModerationAudit.countDocuments(), 1);
});

test("audit insertion failure rolls back approval and its account guard", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner);
  const beforeVendor = await stored(vendor);
  const beforeOwner = await User.findById(owner._id).select("+bookingGuardRevision").lean();
  mock.method(VendorModerationAudit, "create", async () => { throw new Error("Mock audit storage failed"); });
  assert.equal((await review(admin, vendor, "verify", { profileRevision: 0 })).status, 500);
  assert.deepEqual(await stored(vendor), beforeVendor);
  assert.deepEqual(await User.findById(owner._id).select("+bookingGuardRevision").lean(), beforeOwner);
});

test("suspension atomically hides the vendor and revokes sessions; repeats do not revoke twice", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner, { verificationStatus: "approved" });
  const refresh = await RefreshToken.create({ userId: owner._id, tokenHash: "session-hash", expiresAt: new Date(Date.now() + 86400000) });
  const changed = await suspend(admin, vendor, true, { profileRevision: 0 });
  assert.equal(changed.status, 200, changed.body.message);
  assert.ok((await User.findById(owner._id)).suspendedAt);
  assert.equal((await User.findById(owner._id)).authVersion, 1);
  assert.equal((await stored(vendor)).suspended, true);
  assert.ok((await RefreshToken.findById(refresh._id)).revokedAt);
  assert.equal((await request(app).get(`/api/vendors/${vendor._id}`)).status, 404);
  const before = await stored(vendor);
  assert.equal((await suspend(admin, vendor, true, { profileRevision: 0 })).status, 200);
  assert.deepEqual(await stored(vendor), before);
  assert.equal((await User.findById(owner._id)).authVersion, 1);
  assert.equal(await VendorModerationAudit.countDocuments(), 1);
  assert.equal((await suspend(admin, vendor, false, { profileRevision: 1 })).status, 200);
  assert.equal((await stored(vendor)).suspended, false);
  assert.equal((await stored(vendor)).verificationStatus, "approved");
  assert.equal((await User.findById(owner._id)).authVersion, 1);
  assert.equal(await VendorModerationAudit.countDocuments(), 2);
});

test("deactivated and legacy inactive accounts cannot be approved or restored by moderation", async () => {
  const [owner, admin] = await Promise.all([user(), user("admin")]);
  const vendor = await profile(owner, { suspended: true });
  for (const accountStatus of ["deactivated", "", "deleted"]) {
    await User.collection.updateOne({ _id: owner._id }, { $set: { accountStatus, suspendedAt: new Date() } });
    assert.equal((await review(admin, vendor)).status, 409, `approval for inactive status ${JSON.stringify(accountStatus)}`);
    assert.equal((await suspend(admin, vendor, false)).status, 409, `restoration for inactive status ${JSON.stringify(accountStatus)}`);
    assert.equal((await User.findById(owner._id)).accountStatus, accountStatus);
  }
  assert.equal(await VendorModerationAudit.countDocuments(), 0);
});

test("customer suspension remains supported with an ID-only moderation record", async () => {
  const [customer, admin] = await Promise.all([user("customer"), user("admin")]);
  const result = await request(app).patch(`/api/admin/users/${customer._id}/suspension`)
    .set("Authorization", auth(admin)).send({ suspended: true, reason: "Repeated misuse." });
  assert.equal(result.status, 200);
  const audit = await VendorModerationAudit.findOne().lean();
  assert.equal(audit.vendorId, null);
  assert.equal(String(audit.targetUserId), String(customer._id));
  assert.doesNotMatch(JSON.stringify(audit), /private-|9876543210|password/);
});

test("admin vendor filters use escaped search and stable pagination and reject malformed parameters", async () => {
  const [owner, otherOwner, admin] = await Promise.all([user(), user(), user("admin")]);
  const first = await profile(owner);
  const second = await profile(otherOwner, { businessName: "Bright Banquets", city: "Chandigarh", serviceAreas: ["Mohali"], suspended: true });
  const createdAt = new Date("2028-01-01T00:00:00Z");
  await Vendor.updateMany({}, { $set: { createdAt } }, { timestamps: false });
  const list = (params) => request(app).get("/api/admin/vendors").set("Authorization", auth(admin)).query(params);
  assert.equal((await list({ search: ".*" })).body.vendors.length, 0);
  const filtered = await list({ search: "banquets", status: "pending", suspended: "true" });
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.body.vendors.map((vendor) => vendor._id), [String(second._id)]);
  for (const search of ["Chandigarh", "Mohali"])
    assert.deepEqual((await list({ search })).body.vendors.map((vendor) => vendor._id), [String(second._id)]);
  const page1 = await list({ page: 1, limit: 1 });
  const page2 = await list({ page: 2, limit: 1 });
  assert.equal(page1.body.pagination.total, 2);
  assert.deepEqual([page1.body.vendors[0]._id, page2.body.vendors[0]._id], [String(first._id), String(second._id)].sort().reverse());
  for (const params of [{ page: "1abc" }, { limit: "101" }, { status: "verified" }, { suspended: "yes" }, { "search[$ne]": "" }, { page: ["1", "2"] }])
    assert.equal((await list(params)).status, 400, JSON.stringify(params));
});
