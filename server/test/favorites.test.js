import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import Favorite from "../src/models/Favorite.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import generateToken from "../src/utils/generateToken.js";

let mongo;

const auth = (user) => `Bearer ${generateToken(user._id)}`;

before(async () => {
  process.env.JWT_SECRET = "favorite-test-secret";
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

test("customer favorite flow prevents duplicates and returns populated vendors", async () => {
  const [customer, vendorUser] = await User.create([
    {
      name: "Customer One",
      email: "customer@example.com",
      phone: "9999999991",
      password: "secret123",
      role: "customer",
    },
    {
      name: "Vendor Owner",
      email: "vendor@example.com",
      phone: "9999999992",
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
    averageRating: 4.5,
    reviewCount: 2,
  });

  const addResponse = await request(app)
    .post(`/api/favorites/${vendor._id}`)
    .set("Authorization", auth(customer));
  assert.equal(addResponse.status, 201);
  assert.equal(addResponse.body.isFavorited, true);

  const duplicateResponse = await request(app)
    .post(`/api/favorites/${vendor._id}`)
    .set("Authorization", auth(customer));
  assert.equal(duplicateResponse.status, 409);

  const listResponse = await request(app)
    .get("/api/favorites")
    .set("Authorization", auth(customer));
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.count, 1);
  assert.equal(listResponse.body.favorites[0].vendorId.businessName, "Celebration Studio");
  assert.equal(listResponse.body.favorites[0].vendorId.category, "Decoration");
  assert.equal(listResponse.body.favorites[0].vendorId.startingPrice, 50000);

  const checkResponse = await request(app)
    .get(`/api/favorites/check/${vendor._id}`)
    .set("Authorization", auth(customer));
  assert.equal(checkResponse.status, 200);
  assert.equal(checkResponse.body.isFavorited, true);

  const removeResponse = await request(app)
    .delete(`/api/favorites/${vendor._id}`)
    .set("Authorization", auth(customer));
  assert.equal(removeResponse.status, 200);
  assert.equal(removeResponse.body.isFavorited, false);
});

test("favorites are customer-only and reject invalid vendor ids", async () => {
  const vendorUser = await User.create({
    name: "Vendor Owner",
    email: "vendor@example.com",
    phone: "9999999993",
    password: "secret123",
    role: "vendor",
  });

  const forbiddenResponse = await request(app)
    .get("/api/favorites")
    .set("Authorization", auth(vendorUser));
  assert.equal(forbiddenResponse.status, 403);

  const customer = await User.create({
    name: "Customer One",
    email: "customer@example.com",
    phone: "9999999994",
    password: "secret123",
    role: "customer",
  });

  const invalidResponse = await request(app)
    .post("/api/favorites/not-a-valid-id")
    .set("Authorization", auth(customer));
  assert.equal(invalidResponse.status, 400);
});
