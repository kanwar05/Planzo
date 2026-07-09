import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import Review from "../src/models/Review.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import { setNotificationDeliveryOverrides } from "../src/services/transactionalNotificationService.js";
import {
  runNotificationJobs,
  startNotificationSchedulers,
} from "../src/jobs/notificationJobs.js";

let mongo;
let deliveryLog;

const strongPassword = "Planzo@123";

before(async () => {
  process.env.JWT_SECRET = "notifications-test-secret";
  process.env.ENABLE_EMAIL = "true";
  process.env.ENABLE_SMS = "true";
  process.env.TWILIO_PHONE_NUMBER = "+15550000000";
  process.env.BOOKING_REMINDER_HOURS = "24";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.syncIndexes(),
    Vendor.syncIndexes(),
    Booking.syncIndexes(),
    Review.syncIndexes(),
  ]);
});

beforeEach(async () => {
  deliveryLog = [];
  setNotificationDeliveryOverrides({
    sendEmail: async (payload) => {
      deliveryLog.push({ channel: "email", ...payload });
      return { attempted: true, sent: true };
    },
    sendSms: async (payload) => {
      deliveryLog.push({ channel: "sms", ...payload });
      return { attempted: true, sent: true };
    },
  });
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
});

after(async () => {
  setNotificationDeliveryOverrides(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function createActors() {
  const [customer, vendorUser, admin] = await User.create([
    {
      name: "Customer One",
      email: "customer@example.com",
      phone: "9999999991",
      password: strongPassword,
      role: "customer",
    },
    {
      name: "Vendor Owner",
      email: "vendor@example.com",
      phone: "9999999992",
      password: strongPassword,
      role: "vendor",
    },
    {
      name: "Admin One",
      email: "admin@example.com",
      phone: "9999999993",
      password: strongPassword,
      role: "admin",
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

  return { customer, vendorUser, admin, vendor };
}

test("booking accepted and rejected send transactional notifications", async () => {
  const { customer, vendorUser, vendor } = await createActors();
  const booking = await Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Wedding",
    eventDate: new Date(Date.now() + 10 * 86400000),
    eventDateOnly: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    eventStartTime: "10:00",
    eventEndTime: "11:00",
    eventLocation: "Delhi",
    budget: 75000,
    status: "pending",
  });

  const vendorAgent = request.agent(app);
  await vendorAgent.post("/api/auth/login").send({
    email: vendorUser.email,
    password: strongPassword,
  });

  const acceptResponse = await vendorAgent
    .patch(`/api/bookings/${booking._id}/status`)
    .send({ status: "accepted" });
  assert.equal(acceptResponse.status, 200);
  assert.equal(deliveryLog.some((item) => item.channel === "email"), true);
  assert.equal(deliveryLog.some((item) => item.channel === "sms"), true);

  deliveryLog = [];
  const rejectBooking = await Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Birthday",
    eventDate: new Date(Date.now() + 11 * 86400000),
    eventDateOnly: new Date(Date.now() + 11 * 86400000).toISOString().slice(0, 10),
    eventStartTime: "12:00",
    eventEndTime: "13:00",
    eventLocation: "Delhi",
    budget: 65000,
    status: "pending",
  });

  const rejectResponse = await vendorAgent
    .patch(`/api/bookings/${rejectBooking._id}/status`)
    .send({ status: "rejected", reason: "Unavailable" });
  assert.equal(rejectResponse.status, 200);
  assert.equal(deliveryLog.some((item) => item.channel === "email"), true);
  assert.equal(deliveryLog.some((item) => item.channel === "sms"), true);
});

test("reminder jobs send booking and review reminders once", async () => {
  const { customer, vendor } = await createActors();
  const booking = await Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Reception",
    eventDate: new Date(Date.now() + 2 * 86400000),
    eventDateOnly: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    eventStartTime: "15:00",
    eventEndTime: "16:00",
    eventLocation: "Delhi",
    budget: 90000,
    status: "pending",
    bookingReminderDueAt: new Date(Date.now() - 1000),
  });

  const reviewBooking = await Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Engagement",
    eventDate: new Date(Date.now() - 2 * 86400000),
    eventDateOnly: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    eventStartTime: "18:00",
    eventEndTime: "19:00",
    eventLocation: "Delhi",
    budget: 85000,
    status: "completed",
    reviewReminderDueAt: new Date(Date.now() - 1000),
  });

  const result = await runNotificationJobs();
  assert.equal(result.bookingReminders, 1);
  assert.equal(result.reviewReminders, 1);

  const updatedBooking = await Booking.findById(booking._id);
  const updatedReviewBooking = await Booking.findById(reviewBooking._id);
  assert.ok(updatedBooking.bookingReminderSentAt);
  assert.ok(updatedReviewBooking.reviewReminderSentAt);

  const secondRun = await runNotificationJobs();
  assert.equal(secondRun.bookingReminders, 0);
  assert.equal(secondRun.reviewReminders, 0);
});

test("vendor approval, rejection, and password reset send transactional notifications", async () => {
  const { vendorUser, admin, vendor, customer } = await createActors();

  const adminAgent = request.agent(app);
  await adminAgent.post("/api/auth/login").send({
    email: admin.email,
    password: strongPassword,
  });

  await vendor.updateOne({ verificationDocuments: [{ url: "https://example.com/doc.pdf", publicId: "doc" }] });

  const approveResponse = await adminAgent
    .patch(`/api/admin/vendors/${vendor._id}/verify`)
    .send();
  assert.equal(approveResponse.status, 200);

  const rejectedVendorUser = await User.create({
    name: "Rejected Owner",
    email: "rejected@example.com",
    phone: "9999999994",
    password: strongPassword,
    role: "vendor",
  });

  const rejectedVendor = await Vendor.create({
    userId: rejectedVendorUser._id,
    businessName: "Rejected Studio",
    serviceCategory: "Decoration",
    description: "Decor",
    pricing: 12000,
    location: "Delhi",
    verificationStatus: "pending",
    verificationDocuments: [{ url: "https://example.com/doc.pdf", publicId: "doc2" }],
  });
  const rejectResponse = await adminAgent
    .patch(`/api/admin/vendors/${rejectedVendor._id}/reject`)
    .send({ reason: "Incomplete documents" });
  assert.equal(rejectResponse.status, 200);

  const forgotResponse = await request(app).post("/api/auth/forgot-password").send({
    email: customer.email,
  });
  assert.equal(forgotResponse.status, 200);
  assert.ok(forgotResponse.body.resetToken);

  const resetResponse = await request(app).post("/api/auth/reset-password").send({
    token: forgotResponse.body.resetToken,
    password: "Better@12345",
  });
  assert.equal(resetResponse.status, 200);

  assert.equal(deliveryLog.filter((item) => item.channel === "email").length > 0, true);
  assert.equal(deliveryLog.filter((item) => item.channel === "sms").length > 0, true);
});

test("scheduler can start and stop safely", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const timer = startNotificationSchedulers();
  assert.ok(timer);
  clearInterval(timer);
  process.env.NODE_ENV = previousNodeEnv;
});