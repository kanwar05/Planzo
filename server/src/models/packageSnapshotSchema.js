import mongoose from "mongoose";

const integer = (value) => Number.isSafeInteger(value);
const optionalInteger = (value) => value === null || Number.isSafeInteger(value);
const addOnSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 120 },
  priceAmount: { type: Number, required: true, min: 0, max: 100_000_000_000, validate: integer },
  pricingUnit: { type: String, required: true, enum: ["event", "day", "hour", "person", "item"] },
}, { _id: false });

// Embedded at request time, never populated from the mutable package later.
export default new mongoose.Schema({
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: "VendorPackage", required: true },
  revision: { type: Number, required: true, min: 1, validate: integer },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 2000 },
  serviceCategory: { type: String, required: true, maxlength: 120 },
  currency: { type: String, enum: ["INR"], required: true },
  priceAmount: { type: Number, required: true, min: 0, max: 100_000_000_000, validate: integer },
  priceType: { type: String, required: true, enum: ["starting", "fixed"] },
  pricingUnit: { type: String, required: true, enum: ["event", "day", "hour", "person", "item"] },
  includedServices: { type: [{ type: String, maxlength: 300 }], default: [], validate: (items) => items.length <= 30 },
  exclusions: { type: [{ type: String, maxlength: 300 }], default: [], validate: (items) => items.length <= 30 },
  addOns: { type: [addOnSchema], default: [], validate: (items) => items.length <= 20 },
  maxDurationMinutes: { type: Number, default: null, min: 1, max: 525_600, validate: optionalInteger },
  maxQuantity: { type: Number, default: null, min: 1, max: 1_000_000, validate: optionalInteger },
}, { _id: false });
