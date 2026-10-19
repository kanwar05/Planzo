import Vendor, { SERVICE_CATEGORIES } from "../models/Vendor.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

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

export async function hasActiveVendorOwner(vendor) {
  if (!isApprovedVendor(vendor)) return false;
  return Boolean(
    await User.exists({
      _id: vendor.userId?._id || vendor.userId,
      role: "vendor",
      accountStatus: { $ne: "deactivated" },
      suspendedAt: null,
    }),
  );
}

// Explicit output fields also protect existing records that still contain retired data.
export function vendorView(vendor, { contact = false, owner = false } = {}) {
  if (!vendor) return null;
  const source = vendor.toObject ? vendor.toObject() : vendor;
  const fields = [
    "_id",
    "businessName",
    "serviceCategory",
    "description",
    "pricing",
    "location",
    "servicesOffered",
    "profileImage",
    "coverImage",
    "portfolioImages",
    "verificationStatus",
    "verified",
    "createdAt",
    "updatedAt",
  ];
  const result = Object.fromEntries(
    fields
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  result.servicesOffered ||= [];
  result.verificationStatus ||= source.verified ? "approved" : "pending";
  if (contact || owner)
    result.contactDetails = {
      phone: source.contactDetails?.phone || "",
      email: source.contactDetails?.email || "",
    };
  if (owner) {
    result.userId = source.userId;
    result.suspended = Boolean(source.suspended);
    result.verificationRejectionReason =
      source.verificationRejectionReason || "";
  }
  return result;
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const numeric = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max)
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
  const page = Math.floor(numeric(query.page, 1, 1, 100000));
  const limit = Math.floor(numeric(query.limit, 12, 1, 100));
  const minPrice = numeric(query.minPrice, 0);
  const maxPrice = numeric(query.maxPrice, Number.MAX_SAFE_INTEGER);
  if (minPrice > maxPrice)
    throw new ApiError(400, "Minimum price cannot exceed maximum price.");
  const filter = {
    ...approvedVendorFilter(),
    pricing: { $gte: minPrice, $lte: maxPrice },
  };
  filter.userId = {
    $in: await User.find({
      role: "vendor",
      accountStatus: { $ne: "deactivated" },
      suspendedAt: null,
    }).distinct("_id"),
  };
  const category = text(query.category);
  if (category) filter.serviceCategory = category;
  const city = text(query.city);
  if (city)
    filter.location = new RegExp(`^${escapeRegex(city)}(?:\\s*,|$)`, "i");
  const search = text(query.search || query.q);
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    filter.$and = [
      {
        $or: [
          { businessName: regex },
          { serviceCategory: regex },
          { servicesOffered: regex },
        ],
      },
    ];
  }
  const [rows, total] = await Promise.all([
    Vendor.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Vendor.countDocuments(filter),
  ]);
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
