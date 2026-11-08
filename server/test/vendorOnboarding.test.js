import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../src/app.js";
import cloudinary from "../src/config/cloudinary.js";
import Availability from "../src/models/Availability.js";
import Booking from "../src/models/Booking.js";
import NotificationOutbox from "../src/models/NotificationOutbox.js";
import User from "../src/models/User.js";
import Vendor from "../src/models/Vendor.js";
import VendorModerationAudit from "../src/models/VendorModerationAudit.js";
import { generateAccessToken } from "../src/utils/generateToken.js";

let mongo;
let sequence = 0;
let uploaded;
let destroyed;
let uploadBarrier;
const password = "PlanzoOnboarding123!";
const cloudinaryKeys = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
const originalEnvironment = Object.fromEntries(cloudinaryKeys.map((key) => [key, process.env[key]]));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=", "base64");
const auth = (user) => `Bearer ${generateAccessToken(user._id, user.authVersion || 0)}`;
const datePlus = (days = 14) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const profileData = (extra = {}) => ({
  businessName: "Celebration Studio",
  serviceCategory: "Decoration",
  description: "Thoughtful decoration for celebrations.",
  location: "Delhi, India",
  city: "Delhi",
  serviceAreas: ["Delhi NCR", "Chandigarh"],
  pricing: 15000,
  servicesOffered: ["Wedding decoration", "Floral styling"],
  contactDetails: { email: "shared-business@example.com", phone: "+919999888877" },
  ...extra,
});

function newUser(role = "vendor", extra = {}) {
  sequence += 1;
  return User.create({
    name: `${role} ${sequence}`, email: `onboarding-${sequence}@example.com`,
    phone: `988880${String(sequence).padStart(4, "0")}`, password, role, ...extra,
  });
}

const seedVendor = (owner, extra = {}) => Vendor.create({
  ...profileData(), userId: owner._id, verificationStatus: "approved", ...extra,
});
const createProfile = (owner, data = {}) => request(app).post("/api/vendors/profile")
  .set("Authorization", auth(owner)).send(profileData(data));
const editProfile = (owner, data) => request(app).patch("/api/vendors/profile")
  .set("Authorization", auth(owner)).send(data);
const myProfile = (owner) => request(app).get("/api/vendors/me").set("Authorization", auth(owner));
const requestBooking = (customer, vendor, day = 14) => request(app).post("/api/bookings")
  .set("Authorization", auth(customer)).send({
    vendorId: String(vendor._id), eventType: "Wedding", eventDate: datePlus(day),
    eventLocation: "Delhi event hall", description: "A family celebration.",
  });
const changeBooking = (owner, id, status) => request(app).patch(`/api/bookings/${id}/status`)
  .set("Authorization", auth(owner)).send({ status });

async function atSharedGuard(model, field, id, operation) {
  const original = model.findOneAndUpdate;
  let entered = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(release, 5000);
  const mocked = mock.method(model, "findOneAndUpdate", async function (...args) {
    if (String(args[0]?._id) === String(id) && args[1]?.$inc?.[field]) {
      entered += 1;
      if (entered >= 2) release();
      await barrier;
    }
    return original.apply(this, args);
  });
  try {
    const result = await operation();
    assert.ok(entered >= 2, "both HTTP operations reached the shared guard before writing it");
    return result;
  } finally {
    clearTimeout(timer);
    mocked.mock.restore();
  }
}

before(async () => {
  process.env.JWT_SECRET = "vendor-onboarding-test-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(), Vendor.init(), Booking.init(), Availability.init(),
    NotificationOutbox.init(), VendorModerationAudit.init(),
  ]);
});

beforeEach(async () => {
  mock.restoreAll();
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  for (const key of cloudinaryKeys) process.env[key] = "onboarding-test-placeholder";
  uploaded = [];
  destroyed = [];
  uploadBarrier = null;
  mock.method(cloudinary.uploader, "upload_stream", (options, callback) => {
    const upload = { publicId: options.public_id, bytes: 0 };
    uploaded.push(upload);
    return new Writable({
      write(chunk, encoding, done) { upload.bytes += chunk.length; done(); },
      final(done) {
        void Promise.resolve().then(() => uploadBarrier?.()).then(() => {
          callback(null, {
            public_id: options.public_id,
            secure_url: `https://res.cloudinary.com/onboarding/image/upload/${options.public_id}.png`,
            bytes: upload.bytes,
          });
          done();
        }, done);
      },
    });
  });
  mock.method(cloudinary.uploader, "destroy", async (publicId) => {
    destroyed.push(publicId);
    return { result: "ok" };
  });
});

after(async () => {
  mock.restoreAll();
  for (const key of cloudinaryKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("complete vendor onboarding preserves normalized business fields and cannot self-approve or replace ownership", async () => {
  const [owner, otherOwner] = await Promise.all([newUser(), newUser()]);
  const response = await createProfile(owner, {
    businessName: "  Celebration Studio  ", city: "  Delhi  ",
    serviceAreas: [" Delhi NCR ", "Chandigarh", "Delhi NCR"],
    servicesOffered: [" Wedding decoration ", "Floral styling", "Wedding decoration"],
    userId: String(otherOwner._id), verificationStatus: "approved", verified: true,
    suspended: true, bookingRevision: 99,
    profileImage: { url: "https://attacker.example/image.png", publicId: "foreign/asset" },
    verificationRejectionReason: "Fake moderation note",
  });
  assert.equal(response.status, 201, response.body.message);
  const vendor = response.body.vendor;
  assert.equal(String(vendor.userId), String(owner._id));
  assert.equal(vendor.businessName, "Celebration Studio");
  assert.equal(vendor.city, "Delhi");
  assert.deepEqual(vendor.serviceAreas, ["Delhi NCR", "Chandigarh"]);
  assert.deepEqual(vendor.servicesOffered, ["Wedding decoration", "Floral styling"]);
  assert.equal(vendor.verificationStatus, "pending");
  assert.equal(vendor.verified, false);
  assert.equal(vendor.suspended, false);
  assert.equal(vendor.profileImage, null);
  assert.equal(vendor.profileRevision, 0);
  assert.equal(vendor.verificationRejectionReason, "");
  assert.equal((await request(app).get(`/api/vendors/${vendor._id}`)).status, 404);
  assert.deepEqual((await request(app).get("/api/vendors")).body.vendors, []);
  assert.equal((await createProfile(owner)).status, 409);
  assert.equal(await Vendor.countDocuments({ userId: owner._id }), 1);
});

test("onboarding requires the existing essential fields and rejects malformed optional fields before creating a profile", async () => {
  const owner = await newUser();
  const invalid = [
    { businessName: " " }, { businessName: "a".repeat(121) },
    { serviceCategory: "Unsupported category" }, { description: "" },
    { description: "a".repeat(2001) }, { location: [] }, { location: "a".repeat(161) },
    ...[-1, null, true, [], {}, "not a price"].map((pricing) => ({ pricing })),
    { city: "a".repeat(101) }, { city: {} },
    { serviceAreas: "Delhi" }, { serviceAreas: [""] },
    { serviceAreas: Array.from({ length: 21 }, (_, index) => `Area ${index}`) },
    { serviceAreas: ["a".repeat(121)] },
    { servicesOffered: [""] }, { servicesOffered: Array.from({ length: 21 }, () => "Service") },
    { contactDetails: { email: "one@example.com,two@example.com" } },
    { contactDetails: { phone: true } },
  ];
  for (const data of invalid) {
    const response = await createProfile(owner, data);
    assert.equal(response.status, 400, `${JSON.stringify(data)}: ${response.body.message}`);
    assert.equal(await Vendor.countDocuments({ userId: owner._id }), 0);
  }
  for (const field of ["businessName", "serviceCategory", "description", "pricing", "location"]) {
    const data = profileData();
    delete data[field];
    const response = await request(app).post("/api/vendors/profile").set("Authorization", auth(owner)).send(data);
    assert.equal(response.status, 400, field);
  }
  const valid = await createProfile(owner, { pricing: 0, city: "", serviceAreas: [], servicesOffered: [] });
  assert.equal(valid.status, 201, valid.body.message);
  assert.equal(valid.body.vendor.pricing, 0);
});

test("profile routes enforce vendor roles and never let one vendor target another profile", async () => {
  const [owner, otherOwner, customer] = await Promise.all([newUser(), newUser(), newUser("customer")]);
  const vendor = await seedVendor(owner);
  const other = await seedVendor(otherOwner, { businessName: "Other Studio" });
  const otherBefore = await Vendor.findById(other._id).lean();
  assert.equal((await createProfile(customer)).status, 403);
  assert.equal((await editProfile(customer, { businessName: "Customer takeover" })).status, 403);
  assert.equal((await request(app).delete("/api/vendors/profile").set("Authorization", auth(customer))).status, 403);
  assert.equal((await request(app).patch("/api/vendors/profile").send({ businessName: "Anonymous takeover" })).status, 401);
  const response = await editProfile(owner, {
    userId: String(otherOwner._id), _id: String(other._id),
    businessName: "Owner's new business name", verificationStatus: "approved", verified: true,
    suspended: false, profileImage: { url: "https://attacker.example/file.png", publicId: "foreign/asset" },
  });
  assert.equal(response.status, 200, response.body.message);
  assert.equal(response.body.vendor._id, String(vendor._id));
  assert.equal(String(response.body.vendor.userId), String(owner._id));
  assert.equal(response.body.vendor.profileImage, null);
  assert.equal(response.body.vendor.verificationStatus, "pending");
  assert.deepEqual(await Vendor.findById(other._id).lean(), otherBefore);
  assert.equal((await editProfile(otherOwner, { verificationStatus: "approved", suspended: false })).status, 400);
});

test("minor pricing and sharing-contact edits preserve approval while changed public text requires review", async () => {
  const owner = await newUser();
  const vendor = await seedVendor(owner);
  const initial = await myProfile(owner);
  const minor = await editProfile(owner, {
    profileRevision: initial.body.vendor.profileRevision,
    pricing: 17000, contactDetails: { email: "new-business@example.com", phone: "+919999888866" },
  });
  assert.equal(minor.status, 200, minor.body.message);
  assert.equal(minor.body.vendor.verificationStatus, "approved");
  assert.ok(minor.body.vendor.profileRevision > initial.body.vendor.profileRevision);
  const unchanged = await editProfile(owner, {
    profileRevision: minor.body.vendor.profileRevision,
    description: `  ${vendor.description}  `,
    city: vendor.city, serviceAreas: [...vendor.serviceAreas],
  });
  assert.equal(unchanged.status, 200, unchanged.body.message);
  assert.equal(unchanged.body.vendor.verificationStatus, "approved");
  const availability = await request(app).put("/api/vendors/availability").set("Authorization", auth(owner))
    .send({ unavailableDates: [datePlus(40)] });
  assert.equal(availability.status, 200, availability.body.message);
  assert.equal((await myProfile(owner)).body.vendor.verificationStatus, "approved");
  const material = await editProfile(owner, {
    profileRevision: unchanged.body.vendor.profileRevision,
    description: "New public business description for review.",
  });
  assert.equal(material.status, 200, material.body.message);
  assert.equal(material.body.vendor.verificationStatus, "pending");
  assert.equal(material.body.vendor.verified, false);
  assert.equal((await request(app).get(`/api/vendors/${vendor._id}`)).status, 404);
});

test("a rejected vendor can correct and resubmit while stale owner revisions cannot overwrite newer changes", async () => {
  const owner = await newUser();
  await seedVendor(owner, { verificationStatus: "rejected", verificationRejectionReason: "Clarify your business description." });
  const initial = (await myProfile(owner)).body.vendor;
  const resubmitted = await editProfile(owner, {
    profileRevision: initial.profileRevision,
    description: "Updated description with the requested business details.",
  });
  assert.equal(resubmitted.status, 200, resubmitted.body.message);
  assert.equal(resubmitted.body.vendor.verificationStatus, "pending");
  assert.equal(resubmitted.body.vendor.verificationRejectionReason, "");
  const previous = await Vendor.findById(resubmitted.body.vendor._id).select("+contactDetails").lean();
  const stale = await editProfile(owner, { profileRevision: initial.profileRevision, pricing: 1 });
  assert.equal(stale.status, 409, stale.body.message);
  assert.deepEqual(await Vendor.findById(previous._id).select("+contactDetails").lean(), previous);
});

test("public category, city, service-name and price filters include legacy cities without leaking private fields", async () => {
  const owners = await Promise.all(Array.from({ length: 7 }, () => newUser()));
  const first = await seedVendor(owners[0], { businessName: "Floral Studio", pricing: 12000, city: "Delhi", location: "Central service location" });
  const legacy = await seedVendor(owners[1], { businessName: "Legacy Floral Studio", pricing: 14000 });
  await Vendor.collection.updateOne({ _id: legacy._id }, { $unset: { city: "", verificationStatus: "" }, $set: { verified: true } });
  await seedVendor(owners[2], { city: "Mumbai", location: "Delhi, India", pricing: 13000 });
  await seedVendor(owners[3], { verificationStatus: "pending", pricing: 13000 });
  await seedVendor(owners[4], { verificationStatus: "rejected", pricing: 13000 });
  await seedVendor(owners[5], { suspended: true, pricing: 13000 });
  const inactive = await seedVendor(owners[6], { pricing: 13000 });
  await User.updateOne({ _id: owners[6]._id }, { $set: { accountStatus: "deactivated" } });
  await Vendor.collection.updateOne({ _id: first._id }, { $set: {
    verificationRejectionReason: "Private moderation reason", retiredBankDetails: "private-bank-data",
  } });
  const response = await request(app).get("/api/vendors").query({
    category: "Decoration", city: "dElHi", search: "Floral", minPrice: 12000, maxPrice: 14000,
  });
  assert.equal(response.status, 200, response.body.message);
  assert.deepEqual(response.body.vendors.map((vendor) => vendor._id).sort(), [String(first._id), String(legacy._id)].sort());
  assert.equal(response.body.pagination.total, 2);
  for (const vendor of response.body.vendors) {
    for (const field of ["userId", "contactDetails", "verificationRejectionReason", "profileRevision", "bookingRevision", "profileCompletion", "retiredBankDetails"])
      assert.equal(vendor[field], undefined, field);
  }
  const serialized = JSON.stringify(response.body);
  for (const secret of [owners[0].email, owners[0].phone, "shared-business@example.com", "+919999888877", "Private moderation reason", "private-bank-data"])
    assert.equal(serialized.includes(secret), false);
  assert.equal((await request(app).get(`/api/vendors/${inactive._id}`)).status, 404);
  assert.equal((await request(app).get("/api/vendors").query({ search: ".*" })).body.vendors.length, 0);
  assert.ok((await request(app).get("/api/vendors").query({ q: "Floral styling", city: "Delhi" })).body.vendors.length >= 2);
});

test("public aggregation discards malformed legacy nested values instead of exposing private data", async () => {
  const owner = await newUser();
  const vendor = await seedVendor(owner);
  const privateValue = { privateAccountEmail: owner.email, privatePhone: owner.phone, internalNote: "PRIVATE_LEGACY_SENTINEL" };
  await Vendor.collection.updateOne({ _id: vendor._id }, { $set: {
    businessName: privateValue, description: privateValue,
    location: privateValue, city: privateValue,
    servicesOffered: ["Public service", privateValue],
    serviceAreas: ["Delhi", privateValue],
    profileImage: { url: privateValue, publicId: privateValue },
    coverImage: { url: "https://res.cloudinary.com/onboarding/cover.png", publicId: privateValue, hidden: privateValue },
    portfolioImages: [
      "https://res.cloudinary.com/onboarding/legacy.png",
      { url: "https://res.cloudinary.com/onboarding/valid.png", publicId: "owned/valid", hidden: privateValue },
      { url: privateValue, publicId: "malformed/image" },
    ],
    createdAt: privateValue, updatedAt: privateValue,
    verificationRejectionReason: privateValue,
  } });
  const response = await request(app).get("/api/vendors");
  assert.equal(response.status, 200, response.body.message);
  assert.equal(response.body.vendors.length, 1);
  const result = response.body.vendors[0];
  assert.equal(result._id, String(vendor._id));
  assert.deepEqual(result.servicesOffered, ["Public service"]);
  assert.deepEqual(result.serviceAreas, ["Delhi"]);
  assert.equal(result.profileImage, null);
  assert.equal(result.coverImage.url, "https://res.cloudinary.com/onboarding/cover.png");
  assert.equal(typeof result.coverImage.publicId, "string");
  assert.equal(result.portfolioImages.length, 2);
  for (const field of ["businessName", "description", "location", "city"])
    assert.ok(result[field] === undefined || typeof result[field] === "string", field);
  for (const secret of [owner.email, owner.phone, "PRIVATE_LEGACY_SENTINEL"])
    assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.equal(result.contactDetails, undefined);
  assert.equal(result.verificationRejectionReason, undefined);
});

test("public discovery rejects malformed query values and keeps tied pagination stable", async () => {
  const invalid = [
    "page=1.5", "page=0", "page=100001", "limit=1.5", "limit=101",
    "page[]=1", "page=1&page=2", "minPrice[value]=1", "maxPrice[]=100",
    "city[where]=Delhi", "search[]=Floral", "category[]=Decoration", "category=Unknown",
    "minPrice=-1", "maxPrice=Infinity", "minPrice=20&maxPrice=10",
  ];
  for (const query of invalid) {
    const response = await request(app).get(`/api/vendors?${query}`);
    assert.equal(response.status, 400, `${query}: ${response.body.message}`);
  }
  const owners = await Promise.all(Array.from({ length: 5 }, () => newUser()));
  const createdAt = new Date("2025-01-01T00:00:00.000Z");
  const vendors = [];
  for (const owner of owners) vendors.push(await seedVendor(owner, { createdAt }));
  const ids = [];
  for (const page of [1, 2, 3]) {
    const response = await request(app).get("/api/vendors").query({ page, limit: 2 });
    assert.equal(response.status, 200, response.body.message);
    assert.equal(response.body.pagination.total, 5);
    assert.equal(response.body.pagination.pages, 3);
    ids.push(...response.body.vendors.map((vendor) => vendor._id));
  }
  assert.deepEqual(ids, vendors.map((vendor) => String(vendor._id)).sort());
  const repeat = await request(app).get("/api/vendors").query({ page: 1, limit: 2 });
  assert.deepEqual(repeat.body.vendors.map((vendor) => vendor._id), ids.slice(0, 2));
  const beyond = await request(app).get("/api/vendors").query({ page: 4, limit: 2 });
  assert.deepEqual(beyond.body.vendors, []);
  assert.equal(beyond.body.pagination.hasNextPage, false);
});

test("material re-review preserves booking history, reserved dates, allowed completion and durable email events", async () => {
  const [owner, customer] = await Promise.all([newUser(), newUser("customer")]);
  const vendor = await seedVendor(owner);
  const first = await requestBooking(customer, vendor, 20);
  const waiting = await requestBooking(customer, vendor, 21);
  assert.equal(first.status, 201, first.body.message);
  assert.equal(waiting.status, 201, waiting.body.message);
  assert.equal((await changeBooking(owner, first.body.booking._id, "accepted")).status, 200);
  const before = await Booking.findById(first.body.booking._id).lean();
  const edited = await editProfile(owner, { businessName: "Updated business identity for review" });
  assert.equal(edited.status, 200, edited.body.message);
  assert.equal(edited.body.vendor.verificationStatus, "pending");
  assert.deepEqual(await Booking.findById(first.body.booking._id).lean(), before);
  assert.equal((await requestBooking(customer, vendor, 22)).status, 404);
  const jobsBefore = await NotificationOutbox.countDocuments({});
  assert.equal((await changeBooking(owner, waiting.body.booking._id, "accepted")).status, 409);
  assert.equal(await NotificationOutbox.countDocuments({}), jobsBefore);
  const mine = await request(app).get("/api/bookings/my-bookings").set("Authorization", auth(customer));
  const accepted = mine.body.bookings.find((booking) => booking._id === first.body.booking._id);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.vendorId.contactDetails.email, "shared-business@example.com");
  assert.equal((await changeBooking(owner, first.body.booking._id, "completed")).status, 200);
  assert.equal(await Booking.countDocuments({ vendorId: vendor._id, status: "completed", eventDateOnly: datePlus(20) }), 1);
  assert.equal(await NotificationOutbox.countDocuments({ bookingId: before._id, eventType: "booking_completed" }), 1);
  assert.equal((await request(app).delete("/api/vendors/profile").set("Authorization", auth(owner))).status, 409);
});

test("live image routes enforce roles and owned deletion targets before touching another vendor's asset", async () => {
  const [owner, otherOwner, customer, noProfile] = await Promise.all([newUser(), newUser(), newUser("customer"), newUser()]);
  const ownImage = { url: "https://res.cloudinary.com/onboarding/own.png", publicId: "eventifyy/vendors/portfolio/owned-photo" };
  const otherImage = { url: "https://res.cloudinary.com/onboarding/foreign.png", publicId: "eventifyy/vendors/portfolio/foreign-photo" };
  const vendor = await seedVendor(owner, { portfolioImages: [ownImage] });
  const other = await seedVendor(otherOwner, { portfolioImages: [otherImage] });
  for (const [user, expected] of [[customer, 403], [noProfile, 404]]) {
    const response = await request(app).post("/api/vendors/images").set("Authorization", auth(user)).attach("profileImage", png, "profile.png");
    assert.equal(response.status, expected, response.body.message);
  }
  assert.equal((await request(app).post("/api/vendors/images").attach("profileImage", png, "profile.png")).status, 401);
  assert.equal(uploaded.length, 0);
  const foreign = await request(app).delete("/api/vendors/portfolio").set("Authorization", auth(owner))
    .send({ publicId: otherImage.publicId, imageUrl: otherImage.url });
  assert.equal(foreign.status, 404, foreign.body.message);
  assert.deepEqual(destroyed, []);
  const invalid = await request(app).put("/api/vendors/profile-image").set("Authorization", auth(owner))
    .attach("profileImage", png, { filename: "picture.svg", contentType: "image/svg+xml" });
  assert.equal(invalid.status, 400);
  assert.equal(uploaded.length, 0);
  const removed = await request(app).delete("/api/vendors/portfolio").set("Authorization", auth(owner))
    .send({ publicId: ownImage.publicId });
  assert.equal(removed.status, 200, removed.body.message);
  assert.deepEqual(destroyed, [ownImage.publicId]);
  assert.equal((await Vendor.findById(vendor._id)).portfolioImages.length, 0);
  assert.deepEqual((await Vendor.findById(other._id)).portfolioImages.map((image) => image.toObject()), [otherImage]);
});

test("simultaneous combined image uploads preserve the eight-image cap and clean only the losing new upload", async () => {
  const owner = await newUser();
  const existing = Array.from({ length: 7 }, (_, index) => ({
    url: `https://res.cloudinary.com/onboarding/existing-${index}.png`,
    publicId: `eventifyy/vendors/portfolio/existing-${index}`,
  }));
  const vendor = await seedVendor(owner, { portfolioImages: existing });
  let entered = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(release, 5000);
  uploadBarrier = async () => {
    entered += 1;
    if (entered === 2) release();
    await barrier;
  };
  let responses;
  try {
    responses = await Promise.all(["first", "second"].map((name) => request(app).post("/api/vendors/images")
      .set("Authorization", auth(owner)).attach("portfolioImages", png, `${name}.png`)));
  } finally {
    clearTimeout(timer);
    uploadBarrier = null;
  }
  assert.equal(entered, 2);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  const loser = responses.find((response) => response.status !== 200);
  assert.ok([400, 409].includes(loser.status), loser.body.message);
  const stored = await Vendor.findById(vendor._id);
  assert.equal(stored.portfolioImages.length, 8);
  assert.equal(stored.verificationStatus, "pending");
  const storedIds = new Set(stored.portfolioImages.map((image) => image.publicId));
  const discarded = uploaded.filter((upload) => !storedIds.has(upload.publicId));
  assert.equal(discarded.length, 1);
  assert.deepEqual(destroyed, [discarded[0].publicId]);
  for (const image of existing) assert.ok(storedIds.has(image.publicId));
});

test("a changed profile image invalidates the revision an administrator previously inspected", async () => {
  const [owner, admin] = await Promise.all([newUser(), newUser("admin")]);
  const vendor = await seedVendor(owner, { verificationStatus: "pending" });
  const inspected = (await myProfile(owner)).body.vendor;
  const image = await request(app).put("/api/vendors/profile-image").set("Authorization", auth(owner))
    .attach("profileImage", png, "profile.png");
  assert.equal(image.status, 200, image.body.message);
  assert.ok(image.body.vendor.profileRevision > inspected.profileRevision);
  const staleApproval = await request(app).patch(`/api/admin/vendors/${vendor._id}/verify`).set("Authorization", auth(admin))
    .send({ profileRevision: inspected.profileRevision });
  assert.equal(staleApproval.status, 409, staleApproval.body.message);
  assert.equal((await Vendor.findById(vendor._id)).verificationStatus, "pending");
  const freshApproval = await request(app).patch(`/api/admin/vendors/${vendor._id}/verify`).set("Authorization", auth(admin))
    .send({ profileRevision: image.body.vendor.profileRevision });
  assert.equal(freshApproval.status, 200, freshApproval.body.message);
  const cover = await request(app).put("/api/vendors/cover-image").set("Authorization", auth(owner))
    .attach("coverImage", png, "cover.png");
  assert.equal(cover.status, 200, cover.body.message);
  assert.equal(cover.body.vendor.verificationStatus, "pending");
  assert.equal(cover.body.vendor.verified, false);
});

test("customer and vendor deactivation cannot race a new booking into an inactive account and preserve prior history", async () => {
  for (const role of ["customer", "vendor"]) {
    const [owner, customer] = await Promise.all([newUser(), newUser("customer")]);
    const vendor = await seedVendor(owner);
    const historical = await Booking.create({
      customerId: customer._id, vendorId: vendor._id, eventType: "Wedding",
      eventDate: new Date(`${datePlus(-2)}T00:00:00.000Z`),
      eventLocation: "Historical Delhi event hall", description: "Preserved completed event.", status: "completed",
    });
    const historicalJob = await NotificationOutbox.create({
      bookingId: historical._id, eventId: randomUUID(), eventType: "booking_completed",
      recipientUserId: customer._id, recipientEmail: customer.email,
      payload: {
        customerName: customer.name, vendorName: vendor.businessName,
        service: vendor.serviceCategory, eventType: historical.eventType,
        eventDateOnly: historical.eventDateOnly, eventLocation: historical.eventLocation, recipientRole: "customer",
      },
    });
    const beforeBooking = await Booking.findById(historical._id).lean();
    const beforeJob = await NotificationOutbox.findById(historicalJob._id).lean();
    const actor = role === "customer" ? customer : owner;
    const operation = () => Promise.all([
      requestBooking(customer, vendor),
      request(app).delete("/api/auth/account").set("Authorization", auth(actor)).send({ password }),
    ]);
    const [booking, deactivation] = role === "customer"
      ? await atSharedGuard(User, "bookingGuardRevision", customer._id, operation)
      : await atSharedGuard(Vendor, "bookingRevision", vendor._id, operation);
    if (booking.status === 201) {
      assert.equal(deactivation.status, 409, `${role}: ${deactivation.body.message}`);
      assert.equal((await User.findById(actor._id)).accountStatus, "active");
      assert.equal(await Booking.countDocuments({ vendorId: vendor._id, status: "pending" }), 1);
      assert.equal(await NotificationOutbox.countDocuments({ bookingId: booking.body.booking._id, eventType: "booking_requested" }), 1);
    } else {
      assert.equal(deactivation.status, 200, `${role}: ${deactivation.body.message}`);
      assert.ok([403, 404].includes(booking.status), `${role}: ${booking.status} ${booking.body.message}`);
      assert.equal((await User.findById(actor._id)).accountStatus, "deactivated");
      assert.equal(await Booking.countDocuments({ vendorId: vendor._id, status: "pending" }), 0);
      assert.equal(await NotificationOutbox.countDocuments({ eventType: "booking_requested", recipientUserId: owner._id }), 0);
    }
    assert.deepEqual(await Booking.findById(historical._id).lean(), beforeBooking);
    assert.deepEqual(await NotificationOutbox.findById(historicalJob._id).lean(), beforeJob);
    assert.ok(await Vendor.findById(vendor._id), "deactivation retains the vendor profile");
  }
});

test("profile deletion and new booking creation serialize without orphaning a booking or its email intent", async () => {
  const [owner, customer] = await Promise.all([newUser(), newUser("customer")]);
  const vendor = await seedVendor(owner);
  const [booking, deletion] = await atSharedGuard(Vendor, "bookingRevision", vendor._id, () => Promise.all([
    requestBooking(customer, vendor),
    request(app).delete("/api/vendors/profile").set("Authorization", auth(owner)),
  ]));
  if (booking.status === 201) {
    assert.equal(deletion.status, 409, deletion.body.message);
    assert.ok(await Vendor.findById(vendor._id));
    assert.equal(await Booking.countDocuments({ vendorId: vendor._id }), 1);
    assert.equal(await NotificationOutbox.countDocuments({ bookingId: booking.body.booking._id, eventType: "booking_requested" }), 1);
  } else {
    assert.equal(deletion.status, 200, deletion.body.message);
    assert.ok([403, 404].includes(booking.status), `${booking.status}: ${booking.body.message}`);
    assert.equal(await Vendor.findById(vendor._id), null);
    assert.equal(await Booking.countDocuments({ vendorId: vendor._id }), 0);
    assert.equal(await NotificationOutbox.countDocuments({}), 0);
  }
  assert.deepEqual(destroyed, []);
});
