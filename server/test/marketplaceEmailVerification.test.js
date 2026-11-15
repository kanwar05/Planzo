import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import Booking from "../src/models/Booking.js";
import Availability from "../src/models/Availability.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import EmailOtp from "../src/models/EmailOtp.js";
import { generateAccessToken } from "../src/utils/generateToken.js";
import { setOtpEmailSenderForTests } from "../src/services/otpEmailService.js";

let mongo;
let sequence = 0;
let emails;
const auth = (user) => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
const user = (role, verified = false) => User.create({
  name: `Account ${++sequence}`, email: `account-${sequence}@example.test`,
  phone: "9876543210", password: "PlanzoSecure123!", role,
  ...(verified ? { emailVerifiedAt: new Date() } : {}),
});
const vendor = (owner) => Vendor.create({
  userId: owner._id, businessName: "Event studio", serviceCategory: "Decoration",
  description: "Thoughtful event decoration.", pricing: 1000, location: "Delhi",
  verified: true, verificationStatus: "approved",
  contactDetails: { email: "shared@example.test", phone: "+919888888888" },
});
const futureDay = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const bookingBody = (listing) => ({
  vendorId: String(listing._id), eventType: "Wedding", eventDate: futureDay(),
  eventLocation: "Delhi hall", description: "An intimate celebration.",
});

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "marketplace-verification-test-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Availability.init(), NotificationOutbox.init(), EmailOtp.init()]);
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  emails = [];
  setOtpEmailSenderForTests(async (message) => { emails.push(message); });
});
after(async () => {
  setOtpEmailSenderForTests(undefined);
  await mongoose.disconnect();
  await mongo?.stop();
});

test("legacy unverified customers retain sessions/history but cannot create requests before mailbox proof", async () => {
  const [customer, owner] = await Promise.all([user("customer"), user("vendor", true)]);
  await User.collection.updateOne({ _id: customer._id }, { $unset: { emailVerifiedAt: "" } });
  const listing = await vendor(owner);
  const me = await request(app).get("/api/auth/me").set("Authorization", auth(customer));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.emailVerified, false);
  assert.equal((await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer))).status, 200);
  const denied = await request(app).post("/api/bookings").set("Authorization", auth(customer)).send(bookingBody(listing));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await NotificationOutbox.countDocuments(), 0);

  const issued = await request(app).post("/api/auth/email-verification/request")
    .set("Authorization", auth(customer)).send({ email: "untrusted@example.test" });
  assert.equal(issued.status, 200);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, customer.email);
  const code = emails[0].text.match(/\b\d{6}\b/)[0];
  const verified = await request(app).post("/api/auth/email-verification/verify")
    .set("Authorization", auth(customer)).send({ code });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.emailVerified, true);
  const created = await request(app).post("/api/bookings").set("Authorization", auth(customer)).send(bookingBody(listing));
  assert.equal(created.status, 201, created.body.message);
  assert.equal(await NotificationOutbox.countDocuments(), 1);
});

test("all vendor marketplace writes require proof before validation, upload or data mutation", async () => {
  const owner = await user("vendor");
  await vendor(owner);
  for (const [method, path] of [
    ["post", "profile"], ["patch", "profile"], ["delete", "profile"],
    ["post", "availability"], ["put", "availability"], ["delete", "availability"],
    ["post", "images"], ["put", "profile-image"], ["delete", "profile-image"],
    ["put", "cover-image"], ["delete", "cover-image"], ["post", "portfolio"], ["delete", "portfolio"],
  ]) {
    const result = await request(app)[method](`/api/vendors/${path}`).set("Authorization", auth(owner)).send({});
    assert.equal(result.status, 403, `${method} ${path}`);
    assert.equal(result.body.code, "EMAIL_VERIFICATION_REQUIRED");
  }
  assert.equal((await request(app).get("/api/vendors/me").set("Authorization", auth(owner))).status, 200);
  assert.equal((await request(app).get("/api/bookings/vendor-requests").set("Authorization", auth(owner))).status, 200);
  assert.equal(await Vendor.countDocuments(), 1);
  assert.equal(await Availability.countDocuments(), 0);
});

test("unverified vendors cannot transition bookings; customer cancellation and admin management remain available", async () => {
  const [owner, customer, admin] = await Promise.all([user("vendor"), user("customer"), user("admin")]);
  const listing = await vendor(owner);
  const booking = await Booking.create({ ...bookingBody(listing), customerId: customer._id });
  const denied = await request(app).patch(`/api/bookings/${booking._id}/status`)
    .set("Authorization", auth(owner)).send({ status: "accepted" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "EMAIL_VERIFICATION_REQUIRED");
  const rejected = await request(app).patch(`/api/admin/bookings/${booking._id}`)
    .set("Authorization", auth(admin)).send({ status: "rejected", reason: "Unavailable" });
  assert.equal(rejected.status, 200, rejected.body.message);
  const second = await Booking.create({ ...bookingBody(listing), customerId: customer._id });
  const cancelled = await request(app).patch(`/api/bookings/${second._id}/status`)
    .set("Authorization", auth(customer)).send({ status: "cancelled", reason: "Plans changed" });
  assert.equal(cancelled.status, 200, cancelled.body.message);
});

test("booking list endpoints allowlist incomplete populated vendor records for every role", async () => {
  const [owner, customer, admin] = await Promise.all([user("vendor", true), user("customer", true), user("admin")]);
  const listing = await vendor(owner);
  const booking = await Booking.create({ ...bookingBody(listing), customerId: customer._id });
  await Vendor.collection.updateOne({ _id: listing._id }, { $unset: { businessName: "" } });
  await User.collection.updateOne({ _id: customer._id }, { $unset: { name: "" } });
  for (const [actor, path, shared] of [
    [customer, "/api/bookings/my-bookings", false],
    [owner, "/api/bookings/vendor-requests", true],
    [admin, "/api/admin/bookings", true],
  ]) {
    const response = await request(app).get(path).set("Authorization", auth(actor));
    assert.equal(response.status, 200, response.body.message);
    const result = response.body.bookings.find((row) => row._id === String(booking._id));
    assert.ok(result);
    assert.equal(result.vendorId.userId, undefined);
    assert.equal(Boolean(result.vendorId.contactDetails), shared);
    assert.deepEqual(result.customerId, { _id: String(customer._id) });
    assert.doesNotMatch(JSON.stringify(result), /account-\d+@example|9876543210|password|emailVerifiedAt|authVersion/);
  }
});
