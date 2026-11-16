import { MAX_PACKAGE_PRICE, PACKAGE_PRICE_TYPES, PACKAGE_PRICING_UNITS } from "../models/VendorPackage.js";

const identifier = value => {
  const id = typeof value === "string" ? value
    : value?._bsontype === "ObjectId" && typeof value.toHexString === "function" ? value.toHexString() : "";
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
};

// Pure allowlisted views are shared by public packages and booking snapshots.
// Populated/internal package documents never become API responses directly.
export function packageSnapshot(value) {
  const source = typeof value?.toObject === "function" ? value.toObject() : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const result = { packageId: identifier(source._id || source.packageId), currency: "INR" };
  for (const field of ["title", "description", "serviceCategory"])
    if (typeof source[field] === "string") result[field] = source[field];
  for (const [field, minimum, maximum] of [["priceAmount", 0, MAX_PACKAGE_PRICE], ["revision", 1, Number.MAX_SAFE_INTEGER]])
    if (Number.isSafeInteger(source[field]) && source[field] >= minimum && source[field] <= maximum) result[field] = source[field];
  if (PACKAGE_PRICE_TYPES.includes(source.priceType)) result.priceType = source.priceType;
  if (PACKAGE_PRICING_UNITS.includes(source.pricingUnit)) result.pricingUnit = source.pricingUnit;
  for (const field of ["includedServices", "exclusions"])
    result[field] = Array.isArray(source[field]) ? source[field].filter(entry => typeof entry === "string").slice(0, 30) : [];
  result.addOns = Array.isArray(source.addOns) ? source.addOns.slice(0, 20).filter(entry => entry && typeof entry.title === "string" && Number.isSafeInteger(entry.priceAmount) && entry.priceAmount >= 0 && entry.priceAmount <= MAX_PACKAGE_PRICE && PACKAGE_PRICING_UNITS.includes(entry.pricingUnit))
    .map(entry => ({ title: entry.title, priceAmount: entry.priceAmount, pricingUnit: entry.pricingUnit })) : [];
  for (const [field, maximum] of [["maxDurationMinutes", 525600], ["maxQuantity", 1_000_000]])
    result[field] = Number.isSafeInteger(source[field]) && source[field] >= 1 && source[field] <= maximum ? source[field] : null;
  return result;
}

export function packageView(value) {
  const result = packageSnapshot(value);
  if (!result) return null;
  const source = typeof value.toObject === "function" ? value.toObject() : value;
  result._id = result.packageId;
  delete result.packageId;
  result.vendorId = identifier(source.vendorId);
  result.active = source.active === true;
  for (const field of ["createdAt", "updatedAt"])
    if (source[field] instanceof Date && Number.isFinite(source[field].getTime())) result[field] = source[field];
  return result;
}
