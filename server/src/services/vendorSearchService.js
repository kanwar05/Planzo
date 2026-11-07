import Vendor, { SERVICE_CATEGORIES } from "../models/Vendor.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { activeAccountFilter } from "../utils/accountEligibility.js";
import { vendorProfileCompletion } from "./vendorProfileService.js";

export const approvedVendorFilter = () => ({
  suspended: { $ne: true },
  $or: [
    { verificationStatus: "approved" },
    { verificationStatus: { $exists: false }, verified: true },
  ],
});
export const isApprovedVendor = (vendor) =>
  Boolean(
    vendor &&
    !vendor.suspended &&
    (vendor.verificationStatus === "approved" ||
      (!vendor.verificationStatus && vendor.verified)),
  );

export async function hasActiveVendorOwner(vendor, session = null) {
  if (!isApprovedVendor(vendor)) return false;
  return Boolean(
    await User.exists({
      _id: vendor.userId?._id || vendor.userId,
      role: "vendor",
      ...activeAccountFilter(),
    }).session(session),
  );
}

// Explicit output fields also protect existing records that still contain retired data.
export function vendorView(vendor, { contact = false, owner = false } = {}) {
  if (!vendor) return null;
  const source = vendor.toObject ? vendor.toObject() : vendor;
  // Aggregation bypasses schema casting. Check types as well as field names so
  // malformed legacy objects cannot expose nested private/internal properties.
  const result = {};
  const identifier = typeof source._id === "string" ? source._id : source._id?._bsontype === "ObjectId" && typeof source._id.toHexString === "function" ? source._id.toHexString() : "";
  if (/^[a-f0-9]{24}$/i.test(identifier)) result._id = identifier;
  for (const key of ["businessName", "serviceCategory", "description", "location"])
    if (typeof source[key] === "string") result[key] = source[key];
  if (typeof source.pricing === "number" && Number.isFinite(source.pricing)) result.pricing = source.pricing;
  if (typeof source.verified === "boolean") result.verified = source.verified;
  for (const key of ["createdAt", "updatedAt"])
    if (source[key] instanceof Date && Number.isFinite(source[key].getTime())) result[key] = source[key];
  result.servicesOffered = Array.isArray(source.servicesOffered) ? source.servicesOffered.filter((item) => typeof item === "string").slice(0, 20) : [];
  const location = typeof source.location === "string" ? source.location : "";
  result.city = (typeof source.city === "string" && source.city.trim()) || location.split(",")[0].trim();
  result.serviceAreas = Array.isArray(source.serviceAreas) ? source.serviceAreas.filter((area) => typeof area === "string").slice(0, 20) : [];
  const publicImage = (image) => {
    const url = typeof image === "string" ? image : image?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
    return { url, publicId: typeof image?.publicId === "string" ? image.publicId : "" };
  };
  result.profileImage = publicImage(source.profileImage);
  result.coverImage = publicImage(source.coverImage);
  result.portfolioImages = (Array.isArray(source.portfolioImages) ? source.portfolioImages : []).map(publicImage).filter(Boolean);
  result.verificationStatus = ["pending", "approved", "rejected"].includes(source.verificationStatus) ? source.verificationStatus : source.verified === true ? "approved" : "pending";
  if (contact || owner)
    result.contactDetails = {
      phone: typeof source.contactDetails?.phone === "string" ? source.contactDetails.phone : "",
      email: typeof source.contactDetails?.email === "string" ? source.contactDetails.email : "",
    };
  if (owner) {
    result.userId = source.userId;
    result.suspended = Boolean(source.suspended);
    result.verificationRejectionReason =
      typeof source.verificationRejectionReason === "string" ? source.verificationRejectionReason : "";
    result.profileRevision = Number.isSafeInteger(source.profileRevision) && source.profileRevision >= 0 ? source.profileRevision : 0;
    result.profileCompletion = vendorProfileCompletion(source);
  }
  return result;
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const numeric = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false) => {
  if (value === undefined || value === "") return fallback;
  if (!["string", "number"].includes(typeof value) || !/^\d+(?:\.\d+)?$/.test(String(value))) throw new ApiError(400, "Invalid numeric search filter.");
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed)))
    throw new ApiError(400, "Invalid numeric search filter.");
  return parsed;
};
const text = (value) => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 160)
    throw new ApiError(400, "Invalid search filter.");
  return value.trim();
};

export async function searchVendors(query = {}) {
  const page = numeric(query.page, 1, 1, 100000, true);
  const limit = numeric(query.limit, 12, 1, 100, true);
  const minPrice = numeric(query.minPrice, 0);
  const maxPrice = numeric(query.maxPrice, Number.MAX_SAFE_INTEGER);
  if (minPrice > maxPrice)
    throw new ApiError(400, "Minimum price cannot exceed maximum price.");
  const filter = {
    ...approvedVendorFilter(),
    pricing: { $gte: minPrice, $lte: maxPrice },
  };
  const category = text(query.category);
  if (category) {
    if (!SERVICE_CATEGORIES.includes(category)) throw new ApiError(400, "Invalid service category.");
    filter.serviceCategory = category;
  }
  filter.$and = [];
  const city = text(query.city);
  if (city)
    filter.$and.push({ $or: [
      { city: new RegExp(`^${escapeRegex(city)}$`, "i") },
      { city: { $in: [null, ""] }, location: new RegExp(`^${escapeRegex(city)}(?:\\s*,|$)`, "i") },
    ] });
  const search = text(query.search) || text(query.q);
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$and.push(
      {
        $or: [
          { businessName: regex },
          { serviceCategory: regex },
          { servicesOffered: regex },
        ],
      },
    );
  }
  if (!filter.$and.length) delete filter.$and;
  // Join one owner per candidate rather than materializing every active account
  // ID in the application. Count and page share the same eligibility pipeline.
  const [result] = await Vendor.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1, _id: 1 } },
    { $lookup: {
      from: User.collection.name,
      let: { owner: "$userId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$owner"] }, role: "vendor", ...activeAccountFilter() } },
        { $project: { _id: 1 } },
      ], as: "activeOwner",
    } },
    { $match: { "activeOwner.0": { $exists: true } } },
    { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], counts: [{ $count: "total" }] } },
  ]);
  const rows = result.rows;
  const total = result.counts[0]?.total || 0;
  return {
    vendors: rows.map((vendor) => vendorView(vendor)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
}

export const getVendorSearchMeta = () => ({ categories: SERVICE_CATEGORIES });
