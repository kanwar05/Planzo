import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Availability from "../src/models/Availability.js";
import Booking from "../src/models/Booking.js";
import RefreshToken from "../src/models/RefreshToken.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
const password = "PlanzoReliable123!";
const datePlus = (days = 14) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const auth = (user) =>
  `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;

function newUser(role = "customer") {
  sequence += 1;
  return User.create({
    name: `${role} ${sequence}`,
    email: `booking-${sequence}@example.com`,
    phone: `987650${String(sequence).padStart(4, "0")}`,
    password,
    role,
  });
}

async function fixtures() {
  const [customer, owner, admin] = await Promise.all([
    newUser(), newUser("vendor"), newUser("admin"),
  ]);
  const vendor = await Vendor.create({
    userId: owner._id,
    businessName: "Reliable Events",
    serviceCategory: "Decoration",
    description: "Event decoration services.",
    location: "Delhi",
    pricing: 15000,
    verificationStatus: "approved",
    contactDetails: { email: "events@example.com", phone: "8888888888" },
  });
  return { customer, owner, admin, vendor };
}

const payload = (vendor, extra = {}) => ({
  vendorId: String(vendor._id),
  eventType: "Wedding",
  eventDate: datePlus(),
  eventLocation: "Delhi event hall",
  description: "Family wedding celebration.",
  ...extra,
});
const create = (user, vendor, extra) =>
  request(app).post("/api/bookings").set("Authorization", auth(user))
    .send(payload(vendor, extra));
const change = (user, bookingId, status, reason, adminRoute = false) =>
  request(app)
    .patch(adminRoute ? `/api/admin/bookings/${bookingId}` : `/api/bookings/${bookingId}/status`)
    .set("Authorization", auth(user))
    .send({ status, ...(reason === undefined ? {} : { reason }) });
const stored = (id) => Booking.findById(id).lean();

function seedBooking({ customer, vendor }, extra = {}) {
  return Booking.create({
    ...payload(vendor),
    customerId: customer._id,
    vendorId: vendor._id,
    eventDateOnly: datePlus(),
    ...extra,
  });
}

before(async () => {
  process.env.JWT_SECRET = "booking-reliability-tests-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Vendor.init(), Booking.init(), Availability.init(), RefreshToken.init()]);
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections)
    .map((collection) => collection.deleteMany({})));
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("the complete status matrix preserves customer, vendor and admin business rules on both admin APIs", async () => {
  const fixture = await fixtures();
  const states = ["pending", "accepted", "rejected", "cancelled", "completed"];
  const allowedMoves = new Set([
    "pending:accepted", "pending:rejected", "pending:cancelled",
    "accepted:completed", "accepted:cancelled",
  ]);
  const actors = [
    { user: fixture.customer, actions: ["cancelled"] },
    { user: fixture.owner, actions: ["accepted", "rejected", "completed"] },
    { user: fixture.admin, actions: states },
    { user: fixture.admin, actions: states, adminRoute: true },
  ];
  let day = 20;
  for (const actor of actors) {
    for (const from of states) {
      for (const to of states) {
        const booking = await seedBooking(fixture, {
          status: from,
          eventDate: new Date(`${datePlus(day++)}T00:00:00.000Z`),
        });
        const previous = await stored(booking._id);
        const expected = !actor.actions.includes(to) ? 403
          : allowedMoves.has(`${from}:${to}`) ? 200 : 409;
        const response = await change(actor.user, booking._id, to, undefined, actor.adminRoute);
        const label = `${actor.user.role}${actor.adminRoute ? " admin route" : ""}: ${from} -> ${to}`;
        assert.equal(response.status, expected, `${label}: ${response.body.message}`);
        if (expected === 200) {
          assert.equal(response.body.booking.status, to, label);
          assert.equal((await stored(booking._id)).status, to, label);
        } else {
          assert.deepEqual(await stored(booking._id), previous, label);
        }
      }
    }
  }
});

test("ownership and role checks apply to lists, creation and repeated terminal actions", async () => {
  const fixture = await fixtures();
  const [stranger, otherOwner] = await Promise.all([newUser(), newUser("vendor")]);
  await Vendor.create({
    userId: otherOwner._id, businessName: "Other Events", serviceCategory: "Decoration",
    description: "Other event services.", location: "Delhi", pricing: 1000,
    verificationStatus: "approved",
  });
  const booking = await seedBooking(fixture, { status: "accepted" });
  for (const [user, status] of [
    [stranger, "cancelled"], [otherOwner, "accepted"],
    [fixture.customer, "accepted"], [fixture.owner, "cancelled"],
  ]) {
    assert.equal((await change(user, booking._id, status)).status, 403);
  }
  assert.equal((await change(fixture.customer, booking._id, "cancelled", undefined, true)).status, 403);
  assert.equal((await create(fixture.owner, fixture.vendor)).status, 403);
  assert.equal((await create(fixture.admin, fixture.vendor)).status, 403);
  for (const [path, user] of [
    ["/api/bookings/my-bookings", fixture.owner],
    ["/api/bookings/vendor-requests", fixture.customer],
    ["/api/admin/bookings", fixture.customer],
  ]) {
    assert.equal((await request(app).get(path).set("Authorization", auth(user))).status, 403);
  }
  const unrelatedCustomers = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(stranger));
  const unrelatedVendors = await request(app).get("/api/bookings/vendor-requests").set("Authorization", auth(otherOwner));
  assert.deepEqual(unrelatedCustomers.body.bookings, []);
  assert.deepEqual(unrelatedVendors.body.bookings, []);

  assert.equal((await change(fixture.customer, booking._id, "cancelled")).status, 200);
  const previous = await stored(booking._id);
  assert.equal((await change(stranger, booking._id, "cancelled")).status, 403);
  assert.equal((await change(fixture.owner, booking._id, "cancelled")).status, 403);
  assert.deepEqual(await stored(booking._id), previous);
});

test("HTTP-only cookie sessions support booking, acceptance, refresh, cancellation and logout", async () => {
  const { customer, owner, vendor } = await fixtures();
  const customerSession = request.agent(app);
  const vendorSession = request.agent(app);
  for (const [session, user] of [[customerSession, customer], [vendorSession, owner]]) {
    const response = await session.post("/api/auth/login").send({ email: user.email, password });
    assert.equal(response.status, 200);
    assert.match(response.headers["set-cookie"].join(";"), /eventifyy_access=.*HttpOnly/);
    assert.equal(response.body.token, undefined);
  }
  const created = await customerSession.post("/api/bookings").send(payload(vendor));
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.vendorId.contactDetails, undefined);
  const id = created.body.booking._id;
  const incoming = await vendorSession.get("/api/bookings/vendor-requests");
  assert.deepEqual(incoming.body.bookings.map((booking) => booking._id), [id]);
  assert.equal(incoming.body.bookings[0].customerId.email, undefined);
  assert.equal(incoming.body.bookings[0].customerId.phone, undefined);
  assert.equal((await vendorSession.patch(`/api/bookings/${id}/status`).send({ status: "accepted" })).status, 200);
  assert.equal((await customerSession.post("/api/auth/refresh")).status, 200);
  const mine = await customerSession.get("/api/bookings/my-bookings");
  assert.equal(mine.headers["cache-control"], "no-store");
  assert.equal(mine.body.bookings[0].vendorId.contactDetails.email, "events@example.com");
  assert.equal(mine.body.bookings[0].vendorId.userId, undefined);
  assert.equal((await customerSession.patch(`/api/bookings/${id}/status`).send({ status: "cancelled" })).status, 200);
  assert.equal((await customerSession.post("/api/auth/logout")).status, 200);
  assert.equal((await customerSession.get("/api/bookings/my-bookings")).status, 401);
  assert.equal((await request(app).post("/api/bookings").send(payload(vendor))).status, 401);
  assert.equal((await request(app).patch(`/api/bookings/${id}/status`).send({ status: "accepted" })).status, 401);
});

test("sequential accept, reject and cancel repeats return 409 without changing stored reasons or timestamps", async () => {
  const fixture = await fixtures();
  let day = 30;
  for (const action of ["accepted", "rejected", "cancelled"]) {
    const booking = await seedBooking(fixture, { eventDate: new Date(`${datePlus(day++)}T00:00:00.000Z`) });
    const actor = action === "cancelled" ? fixture.customer : fixture.owner;
    const first = await change(actor, booking._id, action, "Original explanation");
    assert.equal(first.status, 200);
    const previous = await stored(booking._id);
    assert.equal((await change(actor, booking._id, action, "Replacement explanation")).status, 409);
    assert.equal((await change(fixture.admin, booking._id, action, "Admin replacement", true)).status, 409);
    assert.deepEqual(await stored(booking._id), previous);
    if (action !== "accepted") {
      assert.equal(previous[action === "rejected" ? "rejectionReason" : "cancellationReason"], "Original explanation");
    }
  }
});

test("concurrent repeats commit one accept, reject or cancel and preserve the winning update", async () => {
  const fixture = await fixtures();
  let day = 40;
  for (const action of ["accepted", "rejected", "cancelled"]) {
    const booking = await seedBooking(fixture, { eventDate: new Date(`${datePlus(day++)}T00:00:00.000Z`) });
    const actor = action === "cancelled" ? fixture.customer : fixture.owner;
    const responses = await Promise.all([
      change(actor, booking._id, action, "First request"),
      change(actor, booking._id, action, "Second request"),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409], action);
    const winner = responses.find((response) => response.status === 200);
    const previous = await stored(booking._id);
    assert.equal(previous.status, action);
    if (action !== "accepted") {
      const reasonField = action === "rejected" ? "rejectionReason" : "cancellationReason";
      assert.equal(previous[reasonField], winner.body.booking[reasonField]);
      assert.equal(previous[reasonField], responses[0].status === 200 ? "First request" : "Second request");
    }
    assert.equal((await change(actor, booking._id, action, "Late retry")).status, 409);
    assert.deepEqual(await stored(booking._id), previous);
  }
});

test("racing acceptance and customer cancellation produce only a legal final state", async () => {
  const fixture = await fixtures();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const eventDate = datePlus(50 + attempt);
    const booking = await seedBooking(fixture, { eventDate: new Date(`${eventDate}T00:00:00.000Z`) });
    const [acceptance, cancellation] = await Promise.all([
      change(fixture.owner, booking._id, "accepted"),
      change(fixture.customer, booking._id, "cancelled", "Plans changed"),
    ]);
    assert.ok([200, 409].includes(acceptance.status), acceptance.body.message);
    assert.ok([200, 409].includes(cancellation.status), cancellation.body.message);
    assert.ok(acceptance.status === 200 || cancellation.status === 200);
    const final = await stored(booking._id);
    assert.equal(final.status, cancellation.status === 200 ? "cancelled" : "accepted");
    const availability = await request(app).get(`/api/vendors/${fixture.vendor._id}/availability`);
    assert.equal(availability.body.availability.bookedDates.includes(eventDate), final.status === "accepted");
  }
});

test("accepted and completed bookings conflict across admin and vendor actions while cancellation releases the date", async () => {
  const fixture = await fixtures();
  const first = await seedBooking(fixture);
  const second = await seedBooking(fixture);
  assert.equal((await change(fixture.owner, first._id, "accepted")).status, 200);
  assert.equal((await change(fixture.admin, second._id, "accepted", undefined, true)).status, 409);
  assert.equal((await create(fixture.customer, fixture.vendor)).status, 409);
  assert.equal((await change(fixture.owner, first._id, "completed")).status, 200);
  assert.equal((await change(fixture.owner, second._id, "accepted")).status, 409);
  assert.equal((await change(fixture.admin, first._id, "cancelled", undefined, true)).status, 409);
  assert.equal((await stored(second._id)).status, "pending");

  const eventDate = datePlus(60);
  const releasing = await seedBooking(fixture, { eventDate });
  const waiting = await seedBooking(fixture, { eventDate });
  assert.equal((await change(fixture.owner, releasing._id, "accepted")).status, 200);
  assert.equal((await change(fixture.owner, waiting._id, "accepted")).status, 409);
  assert.equal((await change(fixture.customer, releasing._id, "cancelled")).status, 200);
  assert.equal((await change(fixture.owner, waiting._id, "accepted")).status, 200);
  assert.equal(await Booking.countDocuments({ vendorId: fixture.vendor._id, eventDateOnly: eventDate, status: { $in: ["accepted", "completed"] } }), 1);
});

test("event dates require real date-only values and preserve today and leap-day semantics", async () => {
  const fixture = await fixtures();
  let leapYear = new Date().getUTCFullYear() + 1;
  while (new Date(`${leapYear}-02-29T00:00:00.000Z`).toISOString().slice(0, 10) !== `${leapYear}-02-29`) leapYear += 1;
  for (const eventDate of [
    `${leapYear + 1}-02-29`, `${leapYear}-04-31`, "2028-2-29",
    `${datePlus()}T00:00:00.000Z`, `${datePlus()}T23:00:00-05:00`,
    "", null, 12345, datePlus(-1),
  ]) {
    assert.equal((await create(fixture.customer, fixture.vendor, { eventDate })).status, 400, String(eventDate));
  }
  for (const eventDate of [datePlus(0), `${leapYear}-02-29`]) {
    const response = await create(fixture.customer, fixture.vendor, { eventDate });
    assert.equal(response.status, 201, response.body.message);
    assert.equal(response.body.booking.eventDateOnly, eventDate);
    assert.equal(response.body.booking.eventDate, `${eventDate}T00:00:00.000Z`);
  }
});

test("acceptance rechecks past dates and dates blocked after a pending request was created", async () => {
  const fixture = await fixtures();
  const past = await seedBooking(fixture, { eventDate: datePlus(-1) });
  assert.equal((await change(fixture.owner, past._id, "accepted")).status, 409);
  assert.equal((await change(fixture.admin, past._id, "accepted", undefined, true)).status, 409);
  const future = await seedBooking(fixture);
  const blocked = await request(app).put("/api/vendors/availability")
    .set("Authorization", auth(fixture.owner)).send({ unavailableDates: [datePlus()] });
  assert.equal(blocked.status, 200);
  assert.equal((await change(fixture.owner, future._id, "accepted")).status, 409);
  assert.equal((await stored(future._id)).status, "pending");
  assert.equal((await change(fixture.owner, future._id, "rejected", "Date unavailable")).status, 200);
});

test("vendor approval and owner account eligibility are rechecked when admins accept existing requests", async () => {
  const fixture = await fixtures();
  const booking = await seedBooking(fixture);
  for (const verificationStatus of ["pending", "rejected"]) {
    await Vendor.updateOne({ _id: fixture.vendor._id }, { $set: { verificationStatus } });
    assert.equal((await change(fixture.admin, booking._id, "accepted", undefined, true)).status, 409);
  }
  await Vendor.updateOne({ _id: fixture.vendor._id }, { $set: { verificationStatus: "approved", suspended: true } });
  assert.equal((await change(fixture.admin, booking._id, "accepted", undefined, true)).status, 409);
  await Vendor.updateOne({ _id: fixture.vendor._id }, { $set: { suspended: false } });
  for (const accountStatus of ["deactivated", "blocked", "suspended"]) {
    // Raw legacy statuses remain relevant even though new User documents only allow active/deactivated.
    await User.collection.updateOne({ _id: fixture.owner._id }, { $set: { accountStatus } });
    assert.equal((await change(fixture.admin, booking._id, "accepted", undefined, true)).status, 409, accountStatus);
    assert.equal((await create(fixture.customer, fixture.vendor)).status, 404, accountStatus);
  }
  await User.collection.updateOne({ _id: fixture.owner._id }, { $set: { accountStatus: "active", suspendedAt: new Date() } });
  assert.equal((await change(fixture.admin, booking._id, "accepted", undefined, true)).status, 409);
  assert.equal((await stored(booking._id)).status, "pending");
  await User.updateOne({ _id: fixture.owner._id }, { $set: { suspendedAt: null } });
  assert.equal((await change(fixture.admin, booking._id, "accepted", undefined, true)).status, 200);
});
