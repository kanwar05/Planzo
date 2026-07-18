import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";

const cache = new Map();
const TTL_MS = 30_000;
const MAX_ENTRIES = 200;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const number = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new ApiError(400, "Invalid numeric search filter.");
  return parsed;
};

export const clearVendorSearchCache = () => cache.clear();

const cached = async (key, load) => {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.value, cacheHit: true };
  const value = await load();
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return { ...value, cacheHit: false };
};

const sortFor = (sort) => ({
  highest_rated: { averageRating: -1, reviewCount: -1, _id: 1 },
  lowest_price: { pricing: 1, averageRating: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  popularity: { popularityScore: -1, averageRating: -1, _id: 1 },
  most_booked: { bookingCount: -1, averageRating: -1, _id: 1 },
  distance: { distanceMeters: 1, averageRating: -1, _id: 1 },
})[sort] || { popularityScore: -1, averageRating: -1, createdAt: -1, _id: 1 };

export const searchVendors = async (query) => {
  const page = Math.floor(number(query.page, 1, { min: 1, max: 100000 }));
  const limit = Math.floor(number(query.limit, 12, { min: 1, max: 30 }));
  const minPrice = number(query.minPrice, 0);
  const maxPrice = number(query.maxPrice, Number.MAX_SAFE_INTEGER);
  if (minPrice > maxPrice) throw new ApiError(400, "Minimum price cannot exceed maximum price.");
  const minRating = number(query.minRating, 0, { max: 5 });
  const minExperience = number(query.minExperience, 0, { max: 100 });
  const radiusKm = number(query.radiusKm, 25, { min: 1, max: 500 });
  const latitude = query.lat === undefined || query.lat === "" ? null : number(query.lat, null, { min: -90, max: 90 });
  const longitude = query.lng === undefined || query.lng === "" ? null : number(query.lng, null, { min: -180, max: 180 });
  if ((latitude === null) !== (longitude === null)) throw new ApiError(400, "Latitude and longitude must be provided together.");
  const categories = String(query.categories || query.category || "").split(",").map((x) => x.trim()).filter(Boolean);
  const availabilityDate = query.availabilityDate ? String(query.availabilityDate) : "";
  if (availabilityDate && !/^\d{4}-\d{2}-\d{2}$/.test(availabilityDate)) throw new ApiError(400, "Availability date must use YYYY-MM-DD.");
  const cacheKey = JSON.stringify({ ...query, page, limit });

  return cached(cacheKey, async () => {
    const pipeline = [];
    if (latitude !== null) pipeline.push({ $geoNear: { near: { type: "Point", coordinates: [longitude, latitude] }, distanceField: "distanceMeters", maxDistance: radiusKm * 1000, spherical: true, key: "locationPoint" } });
    const match = { reported: false, pricing: { $gte: minPrice, $lte: maxPrice }, averageRating: { $gte: minRating }, experience: { $gte: minExperience } };
    if (categories.length) match.serviceCategory = { $in: categories };
    if (query.verified === "true") match.verificationStatus = "approved";
    const clauses = [];
    if (query.city) {
      const city = escapeRegex(query.city);
      clauses.push({ $or: [{ locationCity: new RegExp(`^${city}$`, "i") }, { location: new RegExp(`^${city}(?:,|$)`, "i") }] });
    }
    if (query.search) {
      const regex = new RegExp(escapeRegex(String(query.search).trim()), "i");
      clauses.push({ $or: [{ businessName: regex }, { serviceCategory: regex }, { description: regex }, { location: regex }, { locationCity: regex }] });
    }
    if (clauses.length) match.$and = clauses;
    pipeline.push({ $match: match });
    pipeline.push(
      { $lookup: { from: Booking.collection.name, let: { vendor: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$vendorId", "$$vendor"] }, { $in: ["$status", ["accepted", "completed"]] }] } } }, { $count: "count" }], as: "bookingStats" } },
      { $set: { bookingCount: { $ifNull: [{ $first: "$bookingStats.count" }, 0] }, popularityScore: { $add: [{ $multiply: [{ $ifNull: ["$reviewCount", 0] }, 3] }, { $multiply: [{ $ifNull: [{ $first: "$bookingStats.count" }, 0] }, 5] }, { $cond: [{ $eq: ["$verificationStatus", "approved"] }, 10, 0] }] } } },
    );
    if (availabilityDate) {
      const day = new Date(`${availabilityDate}T00:00:00Z`).getUTCDay();
      pipeline.push(
        { $lookup: { from: "availabilities", localField: "_id", foreignField: "vendorId", as: "availability" } },
        { $match: { $and: [
          { $or: [{ availability: { $size: 0 } }, { "availability.businessHours": { $elemMatch: { dayOfWeek: day, isOpen: true } } }] },
          { "availability.blockedDates": { $not: { $elemMatch: { date: availabilityDate } } } },
          { "availability.vacations": { $not: { $elemMatch: { startDate: { $lte: availabilityDate }, endDate: { $gte: availabilityDate } } } } },
        ] } },
      );
    }
    pipeline.push({ $sort: sortFor(query.sort) }, { $facet: { vendors: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { bookingStats: 0, availability: 0 } }], meta: [{ $count: "total" }] } });
    const [result] = await Vendor.aggregate(pipeline).allowDiskUse(true);
    const total = result.meta[0]?.total || 0;
    return { vendors: result.vendors, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNextPage: page * limit < total } };
  });
};

export const getVendorSearchMeta = async (query = "") => cached(`meta:${query}`, async () => {
  const regex = query ? new RegExp(`^${escapeRegex(query)}`, "i") : null;
  const rows = await Vendor.aggregate([
    { $match: { reported: false } },
    { $project: { city: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$locationCity", ""] } }, 0] }, "$locationCity", { $trim: { input: { $arrayElemAt: [{ $split: ["$location", ","] }, 0] } } }] } } },
    ...(regex ? [{ $match: { city: regex } }] : []),
    { $group: { _id: "$city" } }, { $sort: { _id: 1 } }, { $limit: 12 },
  ]);
  return { cities: rows.map((row) => row._id).filter(Boolean) };
});
