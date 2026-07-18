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
import { clearVendorSearchCache } from "../src/services/vendorSearchService.js";

let mongo;
before(async () => { process.env.JWT_SECRET = "vendor-search-test"; mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([User.syncIndexes(), Vendor.syncIndexes(), Availability.syncIndexes(), Booking.syncIndexes()]); });
beforeEach(async () => { clearVendorSearchCache(); await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function seed() {
  const users = await User.create([
    { name: "Vendor A", email: "search-a@example.com", phone: "9666666601", password: "Planzo@123", role: "vendor" },
    { name: "Vendor B", email: "search-b@example.com", phone: "9666666602", password: "Planzo@123", role: "vendor" },
    { name: "Customer", email: "search-c@example.com", phone: "9666666603", password: "Planzo@123", role: "customer" },
  ]);
  const vendors = await Vendor.create([
    { userId: users[0]._id, businessName: "Delhi Decor", serviceCategory: "Decoration", description: "Premium decor", pricing: 80000, location: "Delhi, India", locationCity: "Delhi", locationPoint: { type: "Point", coordinates: [77.209, 28.6139] }, experience: 8, averageRating: 4.9, reviewCount: 20, verificationStatus: "approved", verified: true },
    { userId: users[1]._id, businessName: "Noida Beats", serviceCategory: "DJ", description: "Dance music", pricing: 30000, location: "Noida, India", locationCity: "Noida", locationPoint: { type: "Point", coordinates: [77.391, 28.5355] }, experience: 3, averageRating: 4.2, reviewCount: 5 },
  ]);
  await Availability.create({ vendorId: vendors[0]._id, blockedDates: [{ date: "2030-12-20", reason: "Booked" }] });
  await Booking.create({ customerId: users[2]._id, vendorId: vendors[0]._id, eventType: "Wedding", eventDate: new Date("2030-10-10"), eventDateOnly: "2030-10-10", eventStartTime: "10:00", eventEndTime: "12:00", eventLocation: "Delhi", budget: 80000, status: "completed" });
}

test("aggregation combines primary vendor filters", async () => {
  await seed();
  const response = await request(app).get("/api/vendors").query({ categories: "Decoration,DJ", city: "Delhi", minPrice: 50000, maxPrice: 100000, minRating: 4.5, minExperience: 5, verified: true });
  assert.equal(response.status, 200); assert.equal(response.body.pagination.total, 1); assert.equal(response.body.vendors[0].businessName, "Delhi Decor");
});

test("availability and city autocomplete return correct results", async () => {
  await seed();
  const search = await request(app).get("/api/vendors").query({ availabilityDate: "2030-12-20" });
  assert.equal(search.status, 200); assert.deepEqual(search.body.vendors.map((x) => x.businessName), ["Noida Beats"]);
  const meta = await request(app).get("/api/vendors/search/meta").query({ q: "De" });
  assert.deepEqual(meta.body.cities, ["Delhi"]);
});

test("radius, booking sorting, pagination, and caching work", async () => {
  await seed();
  const nearby = await request(app).get("/api/vendors").query({ lat: 28.6139, lng: 77.209, radiusKm: 5, sort: "distance" });
  assert.equal(nearby.status, 200, JSON.stringify(nearby.body)); assert.equal(nearby.body.pagination.total, 1);
  const booked = await request(app).get("/api/vendors").query({ sort: "most_booked", limit: 1 });
  assert.equal(booked.body.vendors[0].bookingCount, 1); assert.equal(booked.body.pagination.hasNextPage, true);
  const cached = await request(app).get("/api/vendors").query({ sort: "most_booked", limit: 1 });
  assert.equal(cached.body.cacheHit, true);
});
