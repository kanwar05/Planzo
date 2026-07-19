import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import CalendarConnection from "../src/models/CalendarConnection.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import {
  bookingToGoogleEvent,
  setGoogleCalendarRequestOverride,
  syncVendorCalendar,
} from "../src/services/googleCalendarService.js";
import { encryptSecret } from "../src/utils/tokenEncryption.js";

let mongo;
let vendorUser;
let customer;
let vendor;
let vendorAgent;
const password = "Planzo@123";

before(async () => {
  process.env.JWT_SECRET = "calendar-test-secret";
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "calendar-encryption-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Vendor.syncIndexes(),
    Booking.syncIndexes(),
    CalendarConnection.syncIndexes(),
  ]);
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
  [customer, vendorUser] = await User.create([
    { name: "Calendar Customer", email: "customer@planzo.test", phone: "9999999911", password, role: "customer" },
    { name: "Calendar Vendor", email: "vendor@planzo.test", phone: "9999999912", password, role: "vendor" },
  ]);
  vendor = await Vendor.create({
    userId: vendorUser._id,
    businessName: "Calendar Events",
    serviceCategory: "Event Planner",
    description: "Events",
    pricing: 10000,
    location: "Delhi",
  });
  vendorAgent = request.agent(app);
  await vendorAgent.post("/api/auth/login").send({ email: vendorUser.email, password });
});

after(async () => {
  setGoogleCalendarRequestOverride(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const createBooking = (status = "accepted") =>
  Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Wedding",
    eventDate: new Date("2030-10-10T00:00:00.000Z"),
    eventDateOnly: "2030-10-10",
    eventStartTime: "10:00",
    eventEndTime: "12:00",
    timezone: "Asia/Kolkata",
    eventLocation: "New Delhi",
    budget: 50000,
    status,
  });

test("calendar endpoints are vendor-protected and expose a signed OAuth URL", async () => {
  const status = await vendorAgent.get("/api/calendar/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.connected, false);
  assert.equal(status.body.configured, true);

  const connect = await vendorAgent.post("/api/calendar/google/connect");
  assert.equal(connect.status, 200);
  const url = new URL(connect.body.authorizationUrl);
  assert.equal(url.hostname, "accounts.google.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events");

  assert.equal((await request(app).get("/api/calendar/status")).status, 401);
});

test("event mapping includes timezone, customer reminder, attendee, and stable metadata", async () => {
  const booking = await createBooking();
  await booking.populate("customerId", "name email");
  const event = bookingToGoogleEvent(booking);
  assert.equal(event.start.dateTime, "2030-10-10T10:00:00");
  assert.equal(event.start.timeZone, "Asia/Kolkata");
  assert.equal(event.attendees[0].email, customer.email);
  assert.deepEqual(event.reminders.overrides, [
    { method: "email", minutes: 1440 },
    { method: "popup", minutes: 60 },
  ]);
  assert.equal(event.extendedProperties.private.planzoBookingId, String(booking._id));
});

test("manual sync refreshes OAuth and inserts accepted bookings without exposing token", async () => {
  const booking = await createBooking();
  await CalendarConnection.create({
    user: vendorUser._id,
    email: vendorUser.email,
    refreshTokenEncrypted: encryptSecret(
      "refresh-token",
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    ),
  });
  const calls = [];
  setGoogleCalendarRequestOverride(async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/token")) return { access_token: "access-token" };
    return { id: "event" };
  });

  const result = await syncVendorCalendar(vendorUser._id);
  assert.equal(result.synced, 1);
  assert.ok(calls.some((call) => call.url.includes("/events") && call.options.method === "POST"));
  const saved = await Booking.findById(booking._id);
  assert.ok(saved.googleCalendarEventId);
  const publicConnection = await CalendarConnection.findOne({ user: vendorUser._id });
  assert.equal(publicConnection.refreshTokenEncrypted, undefined);
});

test("ICS export contains accepted bookings", async () => {
  await createBooking();
  const response = await vendorAgent.get("/api/calendar/export");
  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /text\/calendar/);
  assert.match(response.text, /BEGIN:VCALENDAR/);
  assert.match(response.text, /SUMMARY:Wedding — Planzo/);
  assert.match(response.text, /DTSTART;TZID=Asia\/Kolkata:20301010T100000/);
});
