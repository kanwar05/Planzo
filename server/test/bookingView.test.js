import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { bookingView } from "../src/services/bookingViewService.js";

const customerId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const vendorId = new mongoose.Types.ObjectId();
const privateFields = {
  email: "PRIVATE_ACCOUNT_EMAIL", phone: "PRIVATE_ACCOUNT_PHONE",
  password: "PRIVATE_PASSWORD", pendingEmail: "PRIVATE_PENDING_EMAIL",
};
const booking = (extra = {}) => ({
  _id: new mongoose.Types.ObjectId(), status: "pending", eventType: "Wedding",
  eventDate: new Date("2027-03-15T00:00:00.000Z"), eventDateOnly: "2027-03-15",
  eventLocation: "Event hall", description: "Event description", notes: "Customer notes",
  customerId: { _id: customerId, name: "Customer", ...privateFields },
  vendorId: {
    _id: vendorId, businessName: "Vendor", userId: { _id: ownerId, ...privateFields },
    ...privateFields, contactDetails: { email: "shared@example.test", phone: "+919999999999" },
  },
  rejectionReason: "A private rejection reason", cancellationReason: "A private cancellation reason",
  ...extra,
});
const customer = { _id: customerId, role: "customer" };
const owner = { _id: ownerId, role: "vendor" };
const admin = { _id: new mongoose.Types.ObjectId(), role: "admin" };
const outsiders = [
  { _id: new mongoose.Types.ObjectId(), role: "customer" },
  { _id: new mongoose.Types.ObjectId(), role: "vendor" },
  { _id: { arbitrary: "malformed" }, role: "vendor" },
];

test("booking serialization allowlists populated vendors even without a legacy business name", () => {
  for (const businessName of [undefined, null, "", { email: "PRIVATE_NESTED_VALUE" }]) {
    const input = booking();
    input.vendorId.businessName = businessName;
    const result = bookingView(input, customer);
    const serialized = JSON.stringify(result);
    assert.equal(result.vendorId._id, String(vendorId));
    assert.equal(result.vendorId.contactDetails, undefined);
    assert.equal(result.vendorId.userId, undefined);
    assert.deepEqual(result.customerId, { _id: String(customerId), name: "Customer" });
    assert.doesNotMatch(serialized, /PRIVATE_|shared@example|9999999999/);
  }
});

test("shared business contacts remain scoped to owner/admin or associated confirmed customer", () => {
  for (const status of ["pending", "accepted", "completed", "rejected", "cancelled"]) {
    for (const viewer of [customer, owner, admin, ...outsiders]) {
      const result = bookingView(booking({ status }), viewer);
      const expected = viewer === owner || viewer === admin ||
        (viewer === customer && ["accepted", "completed"].includes(status));
      assert.equal(Boolean(result.vendorId.contactDetails), expected);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ACCOUNT|PRIVATE_PASSWORD|PRIVATE_PENDING/);
      if (outsiders.includes(viewer)) {
        assert.equal(result.rejectionReason, undefined);
        assert.equal(result.cancellationReason, undefined);
      }
    }
  }
});

test("malformed legacy references and nested fields never escape through booking fallbacks", () => {
  const cases = [null, undefined, [], "PRIVATE_RAW_REFERENCE", 42, { email: "PRIVATE_NESTED_VALUE" }];
  for (const value of cases) {
    const result = bookingView(booking({ vendorId: value, customerId: value }), admin);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  }
  const malformed = booking({
    customerId: { _id: customerId, name: { email: "PRIVATE_NESTED_VALUE" }, ...privateFields },
    description: { email: "PRIVATE_DESCRIPTION" }, eventLocation: { phone: "PRIVATE_LOCATION" },
    rejectionReason: { email: "PRIVATE_REASON" }, eventDate: { email: "PRIVATE_DATE" },
  });
  malformed.vendorId.contactDetails = { phone: { value: "PRIVATE_CONTACT" }, email: [] };
  malformed.vendorId.businessName = null;
  malformed.vendorId.toObject = "PRIVATE_METHOD";
  const result = bookingView(malformed, admin);
  assert.deepEqual(result.customerId, { _id: String(customerId) });
  assert.deepEqual(result.vendorId.contactDetails, { phone: "", email: "" });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
});

test("unpopulated valid object identifiers stay identifiers and absent references stay null", () => {
  for (const value of [vendorId, String(vendorId)]) {
    const result = bookingView(booking({ vendorId: value, customerId }), customer);
    assert.equal(result.vendorId, String(vendorId));
    assert.equal(result.customerId, String(customerId));
  }
  assert.equal(bookingView(booking({ vendorId: null }), customer).vendorId, null);
});
