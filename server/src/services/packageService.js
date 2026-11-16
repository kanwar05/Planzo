import { createHash } from "node:crypto";
import VendorPackage, { MAX_PACKAGE_PRICE, PACKAGE_PRICE_TYPES, PACKAGE_PRICING_UNITS } from "../models/VendorPackage.js";
import { SERVICE_CATEGORIES } from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
export { packageSnapshot, packageView } from "./packageViewService.js";

const fields = ["title", "description", "serviceCategory", "priceAmount", "priceType", "pricingUnit", "includedServices", "exclusions", "addOns", "maxDurationMinutes", "maxQuantity", "active"];
const text = (value, label, maximum) => {
  if (typeof value !== "string" || value.length > maximum)
    throw new ApiError(400, `${label} must be text up to ${maximum} characters.`);
  const result = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!result) throw new ApiError(400, `${label} is required.`);
  return result;
};
const integer = (value, label, minimum, maximum) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new ApiError(400, `${label} must be an integer between ${minimum} and ${maximum}.`);
  return value;
};
const choice = (value, choices, label) => {
  if (!choices.includes(value)) throw new ApiError(400, `Provide a valid ${label}.`);
  return value;
};
const textList = (value, label, maximum, required = false) => {
  if (!Array.isArray(value) || value.length > maximum || required && !value.length)
    throw new ApiError(400, `${label} must contain ${required ? "1 to " : "at most "}${maximum} entries.`);
  return value.map(entry => text(entry, label, 300));
};

export function packageRevision(value) {
  return integer(value, "Package revision", 1, Number.MAX_SAFE_INTEGER);
}

export function validatePackageInput(body, vendor, { partial = false, enforceCategory = true } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiError(400, "Package data must be an object.");
  const unknown = Object.keys(body).filter(key => !fields.includes(key) && !["revision", "currency"].includes(key));
  if (unknown.length) throw new ApiError(400, "Package data contains unsupported fields.");
  if (body.currency !== undefined && body.currency !== "INR") throw new ApiError(400, "Package currency must be INR.");
  const result = {};
  const include = field => !partial || body[field] !== undefined;
  if (include("title")) result.title = text(body.title, "Package title", 120);
  if (include("description")) result.description = text(body.description, "Package description", 2000);
  if (include("serviceCategory")) {
    choice(body.serviceCategory, SERVICE_CATEGORIES, "service category");
    if (enforceCategory && body.serviceCategory !== vendor.serviceCategory)
      throw new ApiError(400, "Package category must match your vendor profile.");
    result.serviceCategory = body.serviceCategory;
  }
  if (include("priceAmount")) result.priceAmount = integer(body.priceAmount, "Package price in paise", 0, MAX_PACKAGE_PRICE);
  if (include("priceType")) result.priceType = choice(body.priceType, PACKAGE_PRICE_TYPES, "package price type");
  if (include("pricingUnit")) result.pricingUnit = choice(body.pricingUnit, PACKAGE_PRICING_UNITS, "pricing unit");
  if (include("includedServices")) result.includedServices = textList(body.includedServices, "Included services", 30, true);
  if (include("exclusions")) result.exclusions = textList(body.exclusions ?? [], "Exclusions", 30);
  if (include("addOns")) {
    const values = body.addOns ?? [];
    if (!Array.isArray(values) || values.length > 20) throw new ApiError(400, "Use at most 20 add-ons.");
    result.addOns = values.map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !["title", "priceAmount", "pricingUnit"].includes(key)))
        throw new ApiError(400, "Provide valid add-on data.");
      return { title: text(value.title, "Add-on title", 120), priceAmount: integer(value.priceAmount, "Add-on price in paise", 0, MAX_PACKAGE_PRICE), pricingUnit: choice(value.pricingUnit, PACKAGE_PRICING_UNITS, "add-on pricing unit") };
    });
  }
  for (const [field, maximum] of [["maxDurationMinutes", 525600], ["maxQuantity", 1_000_000]]) {
    if (include(field)) result[field] = body[field] == null ? null : integer(body[field], field, 1, maximum);
  }
  if (include("active")) {
    if (body.active !== undefined && typeof body.active !== "boolean") throw new ApiError(400, "Package availability must be true or false.");
    result.active = body.active ?? true;
  }
  if (partial && !Object.keys(result).length) throw new ApiError(400, "Provide a package field to update.");
  return result;
}

export async function getSelectablePackage(packageId, vendor, { session = null } = {}) {
  if (typeof packageId !== "string" || !/^[a-f0-9]{24}$/i.test(packageId)) throw new ApiError(400, "Invalid package id.");
  const item = await VendorPackage.findOne({ _id: packageId, vendorId: vendor._id }).session(session);
  if (!item) throw new ApiError(404, "Package not found for this vendor.");
  if (!item.active || item.serviceCategory !== vendor.serviceCategory)
    throw new ApiError(409, "This package is no longer available. Choose another package or a custom request.");
  return item;
}

const hash = value => createHash("sha256").update(value).digest("hex");
export function packageCreationIdentity(key, data) {
  if (key === undefined) return null;
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(key)) throw new ApiError(400, "Provide a valid Idempotency-Key of 16 to 128 safe ASCII characters.");
  return { creationKeyHash: hash(key), creationRequestHash: hash(JSON.stringify(data)) };
}
