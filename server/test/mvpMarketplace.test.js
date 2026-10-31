import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Availability from "../src/models/Availability.js";
import Booking from "../src/models/Booking.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
const auth = (user) => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
const datePlus = (days = 14) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const newUser = (role = "customer") => {
  sequence += 1;
  return User.create({ name: `${role} ${sequence}`, email: `private-${sequence}@example.com`,
    phone: `999900${String(sequence).padStart(4, "0")}`, password: "PlanzoSecure123!", role });
};
const newVendor = (user, extra = {}) => Vendor.create({ userId: user._id,
  businessName: "Bright Events", serviceCategory: "Decoration", description: "Decor for celebrations.",
  pricing: 12000, location: "Delhi", servicesOffered: ["Wedding decor"],
  verificationStatus: "approved", ...extra });
const bookingPayload = (vendor, extra = {}) => ({ vendorId: String(vendor._id), eventType: "Wedding",
  eventDate: datePlus(), eventLocation: "Delhi hall", description: "An intimate wedding.", ...extra });
const createBooking = (user, vendor, extra = {}) => request(app).post("/api/bookings")
  .set("Authorization", auth(user)).send(bookingPayload(vendor, extra));
const status = (user, id, nextStatus) => request(app).patch(`/api/bookings/${id}/status`)
  .set("Authorization", auth(user)).send({ status: nextStatus });

async function atVendorGuard(operation) {
  const original = Vendor.findOneAndUpdate;
  let entered = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(release, 5000);
  const mocked = mock.method(Vendor, "findOneAndUpdate", async function (...args) {
    if (args[1]?.$inc?.bookingRevision) {
      entered += 1;
      if (entered >= 2) release();
      await barrier;
    }
    return original.apply(this, args);
  });
  try {
    const results = await operation();
    assert.ok(entered >= 2, "both operations reached the shared database guard");
    return results;
  } finally {
    clearTimeout(timer);
    mocked.mock.restore();
  }
}

before(async () => {
  process.env.JWT_SECRET = "planzo-mvp-marketplace-test-secret-with-sufficient-length";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Availability.init()]);
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Vendor.deleteMany({}), Booking.deleteMany({}), Availability.deleteMany({})]);
});
after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("public discovery returns only approved active vendors and never account or sharing contacts", async () => {
  const [owner, pendingOwner, blockedOwner, legacyOwner] = await Promise.all([
    newUser("vendor"), newUser("vendor"), newUser("vendor"), newUser("vendor"),
  ]);
  const vendor = await newVendor(owner, { contactDetails: { email: "business@example.com", phone: "8888888888" } });
  const pending = await newVendor(pendingOwner, { verificationStatus: "pending" });
  await newVendor(blockedOwner);
  await User.updateOne({ _id: blockedOwner._id }, { $set: { suspendedAt: new Date() } });
  // Real legacy database records lack the approval-status field, unlike new profiles.
  const legacy = await newVendor(legacyOwner, { businessName: "Legacy service" });
  await Vendor.collection.updateOne({ _id: legacy._id }, { $unset: { verificationStatus: "" }, $set: { verified: true } });

  const listed = await request(app).get("/api/vendors");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.vendors.length, 2);
  for (const row of listed.body.vendors) {
    assert.equal(row.contactDetails, undefined);
    assert.equal(row.userId, undefined);
    assert.equal(row.email, undefined);
    assert.equal(row.phone, undefined);
  }
  const detail = await request(app).get(`/api/vendors/${vendor._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.vendor.contactDetails, undefined);
  assert.equal(detail.body.vendor.userId, undefined);
  assert.equal((await request(app).get(`/api/vendors/${pending._id}`)).status, 404);
  const filtered = await request(app).get("/api/vendors").query({ search: "Wedding decor", category: "Decoration", city: "Delhi", minPrice: 10000, maxPrice: 13000 });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.vendors.length, 2);
  assert.equal((await request(app).get("/api/vendors").query({ search: ".*" })).body.vendors.length, 0);
  assert.equal((await request(app).get("/api/vendors").query({ minPrice: 20, maxPrice: 10 })).status, 400);
});

test("customers can submit date-only requests; unapproved, past, invalid and unavailable dates are rejected", async () => {
  const [customer, owner, secondOwner] = await Promise.all([newUser(), newUser("vendor"), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const pending = await newVendor(secondOwner, { verificationStatus: "pending" });
  await Availability.create({ vendorId: vendor._id, unavailableDates: [datePlus(15)] });
  assert.equal((await createBooking(customer, pending)).status, 404);
  assert.equal((await createBooking(customer, vendor, { eventDate: "2027-02-30" })).status, 400);
  assert.equal((await createBooking(customer, vendor, { eventDate: datePlus(-1) })).status, 400);
  assert.equal((await createBooking(customer, vendor, { eventDate: datePlus(15) })).status, 409);
  const created = await createBooking(customer, vendor, { notes: "Outdoor stage", budget: 1, status: "accepted", paymentStatus: "paid" });
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.status, "pending");
  assert.equal(created.body.booking.description, "An intimate wedding.");
  assert.equal(created.body.booking.notes, "Outdoor stage");
  assert.equal(created.body.booking.budget, undefined);
  assert.equal(created.body.booking.paymentStatus, undefined);
  assert.equal(created.body.booking.eventDateOnly, datePlus());
  assert.equal((await request(app).post("/api/bookings").set("Authorization", auth(owner)).send(bookingPayload(vendor))).status, 403);
});

test("booking ownership and status transitions are enforced for every role", async () => {
  const [customer, stranger, owner, otherOwner, admin] = await Promise.all([
    newUser(), newUser(), newUser("vendor"), newUser("vendor"), newUser("admin"),
  ]);
  const vendor = await newVendor(owner);
  await newVendor(otherOwner);
  const created = await createBooking(customer, vendor);
  const id = created.body.booking._id;
  assert.equal((await status(stranger, id, "cancelled")).status, 403);
  assert.equal((await status(otherOwner, id, "accepted")).status, 403);
  assert.equal((await status(customer, id, "accepted")).status, 403);
  assert.equal((await status(owner, id, "completed")).status, 409);
  assert.equal((await status(owner, id, "accepted")).status, 200);
  assert.equal((await status(owner, id, "rejected")).status, 409);
  assert.equal((await status(owner, id, "completed")).status, 200);
  assert.equal((await status(customer, id, "cancelled")).status, 409);
  assert.equal((await status(admin, id, "pending")).status, 409);
  const otherBookings = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(stranger));
  assert.deepEqual(otherBookings.body.bookings, []);
  const otherRequests = await request(app).get("/api/bookings/vendor-requests").set("Authorization", auth(otherOwner));
  assert.deepEqual(otherRequests.body.bookings, []);
  const rejected = await createBooking(customer, vendor, { eventDate: datePlus(16) });
  assert.equal((await status(owner, rejected.body.booking._id, "rejected")).status, 200);
  const cancelled = await createBooking(customer, vendor, { eventDate: datePlus(17) });
  assert.equal((await status(customer, cancelled.body.booking._id, "cancelled")).status, 200);
});

test("only the booking customer gets intentionally shared contacts after acceptance; no private fallback", async () => {
  const [customer, stranger, owner] = await Promise.all([newUser(), newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner, { contactDetails: { phone: "8888888888", email: "business@example.com" } });
  const ownerProfile = await request(app).get("/api/vendors/me").set("Authorization", auth(owner));
  assert.equal(ownerProfile.headers["cache-control"], "no-store");
  assert.equal(ownerProfile.body.vendor.contactDetails.email, "business@example.com");
  const created = await createBooking(customer, vendor);
  const id = created.body.booking._id;
  assert.equal(created.body.booking.vendorId.contactDetails, undefined);
  await status(owner, id, "accepted");
  const mine = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer));
  assert.deepEqual(mine.body.bookings[0].vendorId.contactDetails, { phone: "8888888888", email: "business@example.com" });
  assert.equal(mine.body.bookings[0].vendorId.userId, undefined);
  assert.equal(mine.body.bookings[0].customerId.email, undefined);
  assert.equal((await request(app).get(`/api/vendors/${vendor._id}`).set("Authorization", auth(customer))).body.vendor.contactDetails, undefined);
  assert.deepEqual((await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(stranger))).body.bookings, []);
  const requests = await request(app).get("/api/bookings/vendor-requests").set("Authorization", auth(owner));
  assert.equal(requests.body.bookings[0].customerId.phone, undefined);
  assert.equal(requests.body.bookings[0].customerId.email, undefined);
  await status(owner, id, "completed");
  const completed = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer));
  assert.equal(completed.body.bookings[0].vendorId.contactDetails.email, "business@example.com");
  await Vendor.updateOne({ _id: vendor._id }, { $unset: { contactDetails: "" } });
  const withoutContact = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer));
  assert.deepEqual(withoutContact.body.bookings[0].vendorId.contactDetails, { phone: "", email: "" });
  assert.equal(JSON.stringify(withoutContact.body).includes(owner.email), false);
  assert.equal(JSON.stringify(withoutContact.body).includes(owner.phone), false);
});

test("simultaneous acceptance reserves exactly one date and cancellation releases it", async () => {
  const [customer, secondCustomer, owner] = await Promise.all([newUser(), newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const first = await createBooking(customer, vendor);
  const second = await createBooking(secondCustomer, vendor);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  // Release both requests together at the shared database guard. They must
  // serialize even when handled concurrently by separate HTTP requests.
  const originalUpdate = Vendor.findOneAndUpdate;
  let entered = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(release, 5000);
  const mocked = mock.method(Vendor, "findOneAndUpdate", async function (...args) {
    if (args[1]?.$inc?.bookingRevision) {
      entered += 1;
      if (entered >= 2) release();
      await barrier;
    }
    return originalUpdate.apply(this, args);
  });
  let results;
  try {
    results = await Promise.all([status(owner, first.body.booking._id, "accepted"), status(owner, second.body.booking._id, "accepted")]);
  } finally {
    clearTimeout(timer);
    mocked.mock.restore();
  }
  assert.ok(entered >= 2);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await Booking.countDocuments({ vendorId: vendor._id, status: "accepted" }), 1);
  const winnerIndex = results.findIndex((result) => result.status === 200);
  const winner = winnerIndex === 0 ? first : second;
  const winnerCustomer = winnerIndex === 0 ? customer : secondCustomer;
  const loser = winnerIndex === 0 ? second : first;
  assert.equal((await status(winnerCustomer, winner.body.booking._id, "cancelled")).status, 200);
  assert.equal((await status(owner, loser.body.booking._id, "accepted")).status, 200);
  const dates = await request(app).get(`/api/vendors/${vendor._id}/availability`);
  assert.deepEqual(dates.body.availability.bookedDates, [datePlus()]);
  await status(owner, loser.body.booking._id, "completed");
  assert.equal((await createBooking(customer, vendor)).status, 409);
});

test("legacy accepted dates without date keys still block new requests and remain readable", async () => {
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  await Booking.collection.insertOne({ customerId: customer._id, vendorId: vendor._id, eventDate: new Date(`${datePlus()}T10:00:00.000Z`),
    eventType: "Legacy event", eventLocation: "Delhi", specialRequirements: "Old description", status: "accepted" });
  assert.equal((await createBooking(customer, vendor)).status, 409);
  const list = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer));
  assert.equal(list.body.bookings[0].description, "Old description");
  assert.equal(list.body.bookings[0].eventDateOnly, datePlus());
  await Booking.collection.updateOne({ vendorId: vendor._id }, { $set: { eventDateOnly: null } });
  assert.equal((await createBooking(customer, vendor)).status, 409);
  await Booking.collection.updateOne({ vendorId: vendor._id }, { $set: { eventDateOnly: "" } });
  assert.equal((await createBooking(customer, vendor)).status, 409);
});

test("installed unique index arbitrates competing reservation writes independently of API checks", async () => {
  const indexes = await Booking.collection.indexes();
  const index = indexes.find((item) => item.name === "one_confirmed_booking_per_vendor_date");
  assert.deepEqual(index.key, { vendorId: 1, eventDateOnly: 1 });
  assert.equal(index.unique, true);
  assert.deepEqual(index.partialFilterExpression, { status: { $in: ["accepted", "completed"] } });
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const first = await createBooking(customer, vendor);
  const second = await createBooking(customer, vendor);
  const results = await Promise.allSettled([
    Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(first.body.booking._id) }, { $set: { status: "accepted" } }),
    Booking.collection.updateOne({ _id: new mongoose.Types.ObjectId(second.body.booking._id) }, { $set: { status: "completed" } }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.find((item) => item.status === "rejected").reason.code, 11000);
  assert.equal(await Booking.countDocuments({ vendorId: vendor._id, status: { $in: ["accepted", "completed"] } }), 1);
});

test("acceptance and date blocking cannot both commit for the same vendor day", async () => {
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const created = await createBooking(customer, vendor);
  const results = await atVendorGuard(() => Promise.all([
    status(owner, created.body.booking._id, "accepted"),
    request(app).put("/api/vendors/availability").set("Authorization", auth(owner))
      .send({ unavailableDates: [datePlus()] }),
  ]));
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  const booking = await Booking.findById(created.body.booking._id);
  const availability = await Availability.findOne({ vendorId: vendor._id });
  assert.equal(booking.status === "accepted", !availability?.unavailableDates.includes(datePlus()));
  const publicVendor = await request(app).get(`/api/vendors/${vendor._id}`);
  assert.equal(publicVendor.body.vendor.bookingRevision, undefined);
  assert.equal(results.find((item) => item.status === 200).body.booking?.vendorId?.bookingRevision, undefined);
});

test("concurrent partial availability updates preserve both fields and reset preserves reservations", async () => {
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const saved = await atVendorGuard(() => Promise.all([
    request(app).put("/api/vendors/availability").set("Authorization", auth(owner))
      .send({ availableDates: [datePlus(16)] }),
    request(app).post("/api/vendors/availability").set("Authorization", auth(owner))
      .send({ unavailableDates: [datePlus(15)] }),
  ]));
  assert.deepEqual(saved.map((item) => item.status), [200, 200]);
  const availability = await Availability.findOne({ vendorId: vendor._id });
  assert.deepEqual([...availability.availableDates], [datePlus(16)]);
  assert.deepEqual([...availability.unavailableDates], [datePlus(15)]);
  // A day absent from availableDates remains open under the existing rule.
  const created = await createBooking(customer, vendor);
  assert.equal((await status(owner, created.body.booking._id, "accepted")).status, 200);
  const reset = await request(app).delete("/api/vendors/availability").set("Authorization", auth(owner));
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.body.availability.unavailableDates, []);
  assert.deepEqual(reset.body.availability.bookedDates, [datePlus()]);
});

test("inconsistent persisted date keys cannot create or move reservations", async () => {
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const created = await createBooking(customer, vendor);
  const id = new mongoose.Types.ObjectId(created.body.booking._id);
  await Booking.collection.updateOne({ _id: id }, { $set: { eventDateOnly: datePlus(1) } });
  const rejected = await status(owner, id, "accepted");
  assert.equal(rejected.status, 409);
  assert.match(rejected.body.message, /date needs correction/);
  assert.equal((await Booking.findById(id)).status, "pending");
  await Booking.collection.updateOne({ _id: id }, { $set: { eventDateOnly: datePlus(), status: "accepted" } });
  await Booking.collection.updateOne({ _id: id }, { $set: { eventDateOnly: "not-a-date" } });
  assert.equal((await status(owner, id, "completed")).status, 409);
  assert.equal((await Booking.findById(id)).status, "accepted");
});

test("a cancellation winning during acceptance rolls back the transaction guard", async () => {
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  const created = await createBooking(customer, vendor);
  const previousVendor = await Vendor.findById(vendor._id).select("+bookingRevision").lean();
  const original = Booking.findOneAndUpdate;
  let cancelled = false;
  const mocked = mock.method(Booking, "findOneAndUpdate", async function (...args) {
    if (args[1]?.$set?.status === "accepted" && !cancelled) {
      cancelled = true;
      assert.equal((await status(customer, created.body.booking._id, "cancelled")).status, 200);
    }
    return original.apply(this, args);
  });
  let response;
  try {
    response = await status(owner, created.body.booking._id, "accepted");
  } finally {
    mocked.mock.restore();
  }
  assert.equal(cancelled, true);
  assert.equal(response.status, 409);
  assert.equal((await Booking.findById(created.body.booking._id)).status, "cancelled");
  assert.deepEqual(await Vendor.findById(vendor._id).select("+bookingRevision").lean(), previousVendor);
  assert.equal(await Availability.countDocuments({ vendorId: vendor._id }), 0);
  const dates = await request(app).get(`/api/vendors/${vendor._id}/availability`);
  assert.deepEqual(dates.body.availability.bookedDates, []);
});

test("owner date availability cannot be changed by customers or used to override booked dates", async () => {
  const [customer, owner] = await Promise.all([newUser(), newUser("vendor")]);
  const vendor = await newVendor(owner);
  assert.equal((await request(app).put("/api/vendors/availability").set("Authorization", auth(customer)).send({ unavailableDates: [datePlus()] })).status, 403);
  const saved = await request(app).put("/api/vendors/availability").set("Authorization", auth(owner))
    .send({ availableDates: [datePlus(16)], unavailableDates: [datePlus(15)] });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.availability.unavailableDates, [datePlus(15)]);
  assert.equal((await request(app).put("/api/vendors/availability").set("Authorization", auth(owner)).send({ unavailableDates: ["2027-02-30"] })).status, 400);
  const created = await createBooking(customer, vendor);
  await status(owner, created.body.booking._id, "accepted");
  assert.equal((await request(app).put("/api/vendors/availability").set("Authorization", auth(owner)).send({ unavailableDates: [datePlus()] })).status, 409);
});

test("admin approves profiles, lists users and bookings, suspends accounts, and sees basic counts", async () => {
  const [customer, owner, admin] = await Promise.all([newUser(), newUser("vendor"), newUser("admin")]);
  const vendor = await newVendor(owner, { verificationStatus: "pending" });
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", auth(customer))).status, 403);
  assert.equal((await request(app).patch(`/api/admin/vendors/${vendor._id}/verify`).set("Authorization", auth(admin)).send({})).status, 200);
  assert.equal((await request(app).get("/api/vendors")).body.vendors.length, 1);
  const created = await createBooking(customer, vendor);
  assert.equal((await request(app).patch(`/api/admin/bookings/${created.body.booking._id}`).set("Authorization", auth(admin)).send({ status: "cancelled" })).status, 200);
  const users = await request(app).get("/api/admin/users").set("Authorization", auth(admin));
  assert.equal(users.body.pagination.total, 3);
  assert.ok(users.body.users.every((user) => user.password === undefined && user.passwordResetTokenHash === undefined));
  const stats = await request(app).get("/api/admin/stats").set("Authorization", auth(admin));
  assert.equal(stats.body.stats.totalBookings, 1);
  assert.equal(stats.body.stats.cancelledBookings, 1);
  assert.equal(stats.body.stats.totalCustomers, 1);
  assert.equal((await request(app).patch(`/api/admin/users/${owner._id}/suspension`).set("Authorization", auth(admin)).send({ suspended: true, reason: "Repeated abuse" })).status, 200);
  assert.equal((await request(app).get("/api/vendors")).body.vendors.length, 0);
  assert.equal((await request(app).get("/api/vendors/me").set("Authorization", auth(owner))).status, 403);
  assert.equal((await request(app).patch(`/api/admin/users/${owner._id}/suspension`).set("Authorization", auth(admin)).send({ suspended: false })).status, 200);
  assert.equal((await request(app).get("/api/vendors/me").set("Authorization", auth(owner))).status, 401);
  const restoredOwner = await User.findById(owner._id);
  assert.equal((await request(app).get("/api/vendors/me").set("Authorization", auth(restoredOwner))).status, 200);
});
