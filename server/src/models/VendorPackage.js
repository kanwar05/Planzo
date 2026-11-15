import mongoose from "mongoose";
import { SERVICE_CATEGORIES } from "./Vendor.js";

export const PACKAGE_PRICE_TYPES = ["starting", "fixed"];
export const PACKAGE_PRICING_UNITS = ["event", "day", "hour", "person", "item"];
export const MAX_PACKAGE_PRICE = 100_000_000_000;

const integer = (minimum, maximum) => ({
  validator: value => Number.isSafeInteger(value) && value >= minimum && value <= maximum,
  message: "Provide a bounded integer value.",
});
const list = (maximum, required = false) => ({
  type: [{ type: String, trim: true, maxlength: 300 }], default: [],
  validate: { validator: values => values.length <= maximum && (!required || values.length > 0) &&
    values.every(value => typeof value === "string" && value.trim().length > 0), message: "Invalid package service list." },
});
const addOnSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  priceAmount: { type: Number, required: true, validate: integer(0, MAX_PACKAGE_PRICE) },
  pricingUnit: { type: String, enum: PACKAGE_PRICING_UNITS, required: true },
}, { _id: false });

const packageSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  serviceCategory: { type: String, required: true, enum: SERVICE_CATEGORIES },
  currency: { type: String, enum: ["INR"], default: "INR", immutable: true },
  // All commercial amounts are integer paise, never floating-point rupees.
  priceAmount: { type: Number, required: true, validate: integer(0, MAX_PACKAGE_PRICE) },
  priceType: { type: String, enum: PACKAGE_PRICE_TYPES, required: true },
  pricingUnit: { type: String, enum: PACKAGE_PRICING_UNITS, required: true },
  includedServices: list(30, true),
  exclusions: list(30),
  addOns: { type: [addOnSchema], default: [], validate: { validator: values => values.length <= 20, message: "Use at most 20 add-ons." } },
  maxDurationMinutes: { type: Number, default: null, validate: { validator: value => value === null || Number.isSafeInteger(value) && value >= 1 && value <= 525600, message: "Invalid maximum duration." } },
  maxQuantity: { type: Number, default: null, validate: { validator: value => value === null || Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000, message: "Invalid maximum quantity." } },
  active: { type: Boolean, default: true, required: true },
  revision: { type: Number, default: 1, required: true, validate: integer(1, Number.MAX_SAFE_INTEGER) },
  creationKeyHash: { type: String, select: false, match: /^[a-f0-9]{64}$/ },
  creationRequestHash: { type: String, select: false, match: /^[a-f0-9]{64}$/ },
}, { timestamps: true, versionKey: false });

packageSchema.index({ vendorId: 1, active: 1, createdAt: -1 });
packageSchema.index({ vendorId: 1, creationKeyHash: 1 }, {
  unique: true, name: "one_package_per_vendor_creation_key",
  partialFilterExpression: { creationKeyHash: { $type: "string" } },
});

export default mongoose.model("VendorPackage", packageSchema);
