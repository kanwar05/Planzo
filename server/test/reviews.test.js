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
import generateToken from "../src/utils/generateToken.js";

let mongo;

const auth = (user) => `Bearer ${generateToken(user._id)}`;

before(async () => {
  process.env.JWT_SECRET = "review-test-secret";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Review.syncIndexes();
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

test("completed booking review lifecycle enforces ownership and recalculates rating", async () => {
  const [customer, otherCustomer, vendorUser] = await User.create([
    {
      name: "Customer One",
      email: "customer@example.com",
      phone: "9999999991",
      password: "secret123",
      role: "customer",
    },
    {
      name: "Customer Two",
      email: "other@example.com",
      phone: "9999999992",
      password: "secret123",
      role: "customer",
    },
    {
      name: "Vendor Owner",
      email: "vendor@example.com",
      phone: "9999999993",
      password: "secret123",
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

  const booking = await Booking.create({
    customerId: customer._id,
    vendorId: vendor._id,
    eventType: "Wedding",
    eventDate: new Date(Date.now() + 86400000),
    eventLocation: "Delhi",
    budget: 75000,
    status: "pending",
  });

  const pendingResponse = await request(app)
    .post("/api/reviews")
    .set("Authorization", auth(customer))
    .send({ bookingId: booking._id, rating: 5, comment: "Excellent work." });
  assert.equal(pendingResponse.status, 409);

  booking.status = "completed";
  await booking.save();

  const forbiddenResponse = await request(app)
    .post("/api/reviews")
    .set("Authorization", auth(otherCustomer))
    .send({ bookingId: booking._id, rating: 5, comment: "Not my booking." });
  assert.equal(forbiddenResponse.status, 403);

  const createResponse = await request(app)
    .post("/api/reviews")
    .set("Authorization", auth(customer))
    .send({ bookingId: booking._id, rating: 5, comment: "Excellent work." });
  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.review.rating, 5);

  const duplicateResponse = await request(app)
    .post("/api/reviews")
    .set("Authorization", auth(customer))
    .send({ bookingId: booking._id, rating: 4, comment: "Again." });
  assert.equal(duplicateResponse.status, 409);

  let refreshedVendor = await Vendor.findById(vendor._id);
  assert.equal(refreshedVendor.averageRating, 5);
  assert.equal(refreshedVendor.reviewCount, 1);

  const reviewId = createResponse.body.review._id;
  const editResponse = await request(app)
    .patch(`/api/reviews/${reviewId}`)
    .set("Authorization", auth(customer))
    .send({ rating: 4, comment: "Very good service." });
  assert.equal(editResponse.status, 200);
  assert.equal(editResponse.body.review.rating, 4);

  const replyResponse = await request(app)
    .patch(`/api/reviews/${reviewId}/reply`)
    .set("Authorization", auth(vendorUser))
    .send({ message: "Thank you for celebrating with us." });
  assert.equal(replyResponse.status, 200);
  assert.equal(
    replyResponse.body.review.vendorReply.message,
    "Thank you for celebrating with us.",
  );

  const bookingReviewResponse = await request(app)
    .get(`/api/bookings/${booking._id}/review`)
    .set("Authorization", auth(customer));
  assert.equal(bookingReviewResponse.status, 200);
  assert.equal(bookingReviewResponse.body.review._id, reviewId);

  const deleteResponse = await request(app)
    .delete(`/api/reviews/${reviewId}`)
    .set("Authorization", auth(customer));
  assert.equal(deleteResponse.status, 200);

  refreshedVendor = await Vendor.findById(vendor._id);
  assert.equal(refreshedVendor.averageRating, 0);
  assert.equal(refreshedVendor.reviewCount, 0);
});
