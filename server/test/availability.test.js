import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Availability from "../src/models/Availability.js";
import Booking from "../src/models/Booking.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import generateToken from "../src/utils/generateToken.js";

let mongo;

const auth = (user) => `Bearer ${generateToken(user._id)}`;
const datePlus = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const openEveryDay = () =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    startTime: "09:00",
    endTime: "17:00",
  }));

const bookingPayload = (vendorId, overrides = {}) => ({
  vendorId,
  eventType: "Wedding",
  eventDate: datePlus(8),
  eventStartTime: "10:00",
  eventEndTime: "11:00",
  eventLocation: "Delhi",
  budget: 90000,
  ...overrides,
});

before(async () => {
  process.env.JWT_SECRET = "availability-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Vendor.syncIndexes(),
    Booking.syncIndexes(),
    Availability.syncIndexes(),
  ]);
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("availability settings block unavailable and overlapping booking slots", async () => {
  const [customer, secondCustomer, vendorUser] = await User.create([
    {
      name: "Customer One",
      email: "customer@example.com",
      phone: "9999999991",
      password: "Planzo@123",
      role: "customer",
    },
    {
      name: "Customer Two",
      email: "other@example.com",
      phone: "9999999992",
      password: "Planzo@123",
      role: "customer",
    },
    {
      name: "Vendor Owner",
      email: "vendor@example.com",
      phone: "9999999993",
      password: "Planzo@123",
      role: "vendor",
    },
  ]);

  const vendor = await Vendor.create({
    userId: vendorUser._id,
    businessName: "Celebration Studio",
    serviceCategory: "Decoration",
    description: "Thoughtful event decoration.",
    pricing: 50000,
    location: "Delhi",
  });

  const blockedDate = datePlus(6);
  const vacationDate = datePlus(7);
  const bookingDate = datePlus(8);

  const availabilityResponse = await request(app)
    .put("/api/vendor/availability")
    .set("Authorization", auth(vendorUser))
    .send({
      slotDurationMinutes: 60,
      businessHours: openEveryDay(),
      blockedDates: [{ date: blockedDate, reason: "Private event" }],
      blockedTimeSlots: [
        {
          date: bookingDate,
          startTime: "12:00",
          endTime: "13:00",
          reason: "Team break",
        },
      ],
      vacations: [
        {
          startDate: vacationDate,
          endDate: vacationDate,
          reason: "Out of town",
        },
      ],
    });
  assert.equal(availabilityResponse.status, 200);
  assert.equal(availabilityResponse.body.availability.blockedDates.length, 1);

  const publicAvailability = await request(app).get(
    `/api/vendors/${vendor._id}/availability?date=${bookingDate}`,
  );
  assert.equal(publicAvailability.status, 200);
  assert.equal(publicAvailability.body.availableSlots.length, 8);
  assert.equal(
    publicAvailability.body.availableSlots.find(
      (slot) => slot.startTime === "12:00",
    ).available,
    false,
  );

  const blockedDateResponse = await request(app)
    .post("/api/bookings")
    .set("Authorization", auth(customer))
    .send(bookingPayload(vendor._id, { eventDate: blockedDate }));
  assert.equal(blockedDateResponse.status, 409);

  const vacationResponse = await request(app)
    .post("/api/bookings")
    .set("Authorization", auth(customer))
    .send(bookingPayload(vendor._id, { eventDate: vacationDate }));
  assert.equal(vacationResponse.status, 409);

  const blockedSlotResponse = await request(app)
    .post("/api/bookings")
    .set("Authorization", auth(customer))
    .send(
      bookingPayload(vendor._id, {
        eventDate: bookingDate,
        eventStartTime: "12:00",
        eventEndTime: "13:00",
      }),
    );
  assert.equal(blockedSlotResponse.status, 409);

  const validResponse = await request(app)
    .post("/api/bookings")
    .set("Authorization", auth(customer))
    .send(bookingPayload(vendor._id, { eventDate: bookingDate }));
  assert.equal(validResponse.status, 201);

  const overlapResponse = await request(app)
    .post("/api/bookings")
    .set("Authorization", auth(secondCustomer))
    .send(
      bookingPayload(vendor._id, {
        eventDate: bookingDate,
        eventStartTime: "10:30",
        eventEndTime: "11:30",
      }),
    );
  assert.equal(overlapResponse.status, 409);
});
