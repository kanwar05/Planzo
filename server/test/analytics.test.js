import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Booking from "../src/models/Booking.js";
import Favorite from "../src/models/Favorite.js";
import Notification from "../src/models/Notification.js";
import Review from "../src/models/Review.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import generateToken from "../src/utils/generateToken.js";

let mongo;

const auth = (user) => `Bearer ${generateToken(user._id)}`;

before(async () => {
  process.env.JWT_SECRET = "analytics-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Favorite.syncIndexes();
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

const seedDashboardData = async () => {
  const [customer, vendorUser, admin] = await User.create([
    {
      name: "Customer One",
      email: "customer.analytics@example.com",
      phone: "9000000001",
      password: "secret123",
      role: "customer",
    },
    {
      name: "Vendor Owner",
      email: "vendor.analytics@example.com",
      phone: "9000000002",
      password: "secret123",
      role: "vendor",
    },
    {
      name: "Admin One",
      email: "admin.analytics@example.com",
      phone: "9000000003",
      password: "secret123",
      role: "admin",
    },
  ]);

  const vendor = await Vendor.create({
    userId: vendorUser._id,
    businessName: "Real Events Co",
    serviceCategory: "Decoration",
    description: "Analytics-ready event decoration.",
    pricing: 25000,
    location: "Delhi",
    averageRating: 4.5,
    reviewCount: 1,
    verified: true,
    verificationStatus: "approved",
    reported: true,
    reportReasons: ["Spam"],
    verificationDocuments: [
      {
        url: "https://example.com/doc.pdf",
        originalName: "doc.pdf",
      },
    ],
  });

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const [pendingBooking, acceptedBooking, completedBooking, cancelledBooking] =
    await Booking.create([
      {
        customerId: customer._id,
        vendorId: vendor._id,
        eventType: "Wedding",
        eventDate: tomorrow,
        eventDateOnly: tomorrow.toISOString().slice(0, 10),
        eventStartTime: "10:00",
        eventEndTime: "12:00",
        eventLocation: "Delhi",
        budget: 10000,
        status: "pending",
      },
      {
        customerId: customer._id,
        vendorId: vendor._id,
        eventType: "Birthday",
        eventDate: tomorrow,
        eventDateOnly: tomorrow.toISOString().slice(0, 10),
        eventStartTime: "14:00",
        eventEndTime: "16:00",
        eventLocation: "Delhi",
        budget: 20000,
        status: "accepted",
      },
      {
        customerId: customer._id,
        vendorId: vendor._id,
        eventType: "Corporate",
        eventDate: yesterday,
        eventDateOnly: yesterday.toISOString().slice(0, 10),
        eventStartTime: "09:00",
        eventEndTime: "11:00",
        eventLocation: "Noida",
        budget: 30000,
        status: "completed",
      },
      {
        customerId: customer._id,
        vendorId: vendor._id,
        eventType: "Engagement",
        eventDate: yesterday,
        eventDateOnly: yesterday.toISOString().slice(0, 10),
        eventStartTime: "18:00",
        eventEndTime: "20:00",
        eventLocation: "Gurgaon",
        budget: 40000,
        status: "cancelled",
      },
    ]);

  await Favorite.create({
    customerId: customer._id,
    vendorId: vendor._id,
  });

  await Notification.create({
    userId: customer._id,
    type: "booking_accepted",
    title: "Booking Accepted",
    message: "Your booking was accepted.",
    bookingId: acceptedBooking._id,
    vendorId: vendor._id,
  });

  await Review.create({
    customerId: customer._id,
    vendorId: vendor._id,
    bookingId: completedBooking._id,
    rating: 5,
    comment: "Excellent work.",
  });

  return {
    customer,
    vendorUser,
    admin,
    vendor,
    bookings: [pendingBooking, acceptedBooking, completedBooking, cancelledBooking],
  };
};

test("customer dashboard returns real booking, favorite, notification, and payment metrics", async () => {
  const { customer } = await seedDashboardData();

  const response = await request(app)
    .get("/api/analytics/customer?limit=2")
    .set("Authorization", auth(customer));

  assert.equal(response.status, 200);
  assert.equal(response.body.dashboard.summary.totalBookings, 4);
  assert.equal(response.body.dashboard.summary.upcomingBookings, 2);
  assert.equal(response.body.dashboard.summary.completedBookings, 1);
  assert.equal(response.body.dashboard.summary.cancelledBookings, 1);
  assert.equal(response.body.dashboard.summary.favoriteVendors, 1);
  assert.equal(response.body.dashboard.summary.pendingPayments, 30000);
  assert.equal(response.body.dashboard.recentNotifications.length, 1);
  assert.equal(response.body.dashboard.bookings.pagination.total, 4);
  assert.equal(response.body.dashboard.bookings.items.length, 2);
});

test("vendor dashboard returns revenue, profile, rating, events, and occupancy from bookings", async () => {
  const { vendorUser } = await seedDashboardData();

  const response = await request(app)
    .get("/api/analytics/vendor?limit=10")
    .set("Authorization", auth(vendorUser));

  assert.equal(response.status, 200);
  assert.equal(response.body.dashboard.summary.totalBookings, 4);
  assert.equal(response.body.dashboard.summary.pendingRequests, 1);
  assert.equal(response.body.dashboard.summary.acceptedBookings, 1);
  assert.equal(response.body.dashboard.summary.monthlyRevenue, 50000);
  assert.equal(response.body.dashboard.summary.totalEarnings, 30000);
  assert.equal(response.body.dashboard.summary.averageRating, 4.5);
  assert.equal(response.body.dashboard.summary.reviewCount, 1);
  assert.equal(response.body.dashboard.summary.verificationStatus, "approved");
  assert.equal(response.body.dashboard.upcomingEvents.length, 2);
  assert.ok(response.body.dashboard.calendarOccupancy.length >= 1);
});

test("admin dashboard returns platform-wide user, vendor, booking, graph, and report metrics", async () => {
  const { admin } = await seedDashboardData();

  const response = await request(app)
    .get("/api/analytics/admin?limit=5")
    .set("Authorization", auth(admin));

  assert.equal(response.status, 200);
  assert.equal(response.body.dashboard.summary.totalUsers, 3);
  assert.equal(response.body.dashboard.summary.customers, 1);
  assert.equal(response.body.dashboard.summary.vendors, 1);
  assert.equal(response.body.dashboard.summary.verifiedVendors, 1);
  assert.equal(response.body.dashboard.summary.pendingVerification, 0);
  assert.equal(response.body.dashboard.summary.totalBookings, 4);
  assert.equal(response.body.dashboard.recentReports.pagination.total, 1);
  assert.ok(response.body.dashboard.monthlyBookingGraph.length >= 1);
  assert.ok(response.body.dashboard.revenueGraph.length >= 1);
  assert.ok(response.body.dashboard.userGrowth.length >= 1);
  assert.ok(response.body.dashboard.platformActivity.length >= 1);
});

test("dashboard analytics enforce role-specific access", async () => {
  const { customer, vendorUser, admin } = await seedDashboardData();

  const vendorAsCustomer = await request(app)
    .get("/api/analytics/customer")
    .set("Authorization", auth(vendorUser));
  assert.equal(vendorAsCustomer.status, 403);

  const adminAsVendor = await request(app)
    .get("/api/analytics/vendor")
    .set("Authorization", auth(admin));
  assert.equal(adminAsVendor.status, 403);

  const customerAsAdmin = await request(app)
    .get("/api/analytics/admin")
    .set("Authorization", auth(customer));
  assert.equal(customerAsAdmin.status, 403);
});
