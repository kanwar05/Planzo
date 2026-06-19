import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  pick,
  requireFields,
  toNonNegativeNumber,
  validateObjectId,
} from "../utils/validation.js";

const EDITABLE_FIELDS = [
  "businessName",
  "serviceCategory",
  "description",
  "experience",
  "pricing",
  "location",
  "portfolioImages",
];

function normalizeVendorInput(body) {
  const data = pick(body, EDITABLE_FIELDS);

  if (data.experience !== undefined) {
    data.experience = toNonNegativeNumber(data.experience, "Experience");
  }
  if (data.pricing !== undefined) {
    data.pricing = toNonNegativeNumber(data.pricing, "Pricing");
  }
  if (
    data.portfolioImages !== undefined &&
    (!Array.isArray(data.portfolioImages) ||
      data.portfolioImages.some((image) => typeof image !== "string"))
  ) {
    throw new ApiError(400, "portfolioImages must be an array of strings.");
  }

  return data;
}

export const createVendorProfile = asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "businessName",
    "serviceCategory",
    "description",
    "pricing",
    "location",
  ]);

  const existingProfile = await Vendor.findOne({ userId: req.user._id });
  if (existingProfile) {
    throw new ApiError(
      409,
      "A vendor profile already exists. Use PATCH to update it.",
    );
  }

  const vendor = await Vendor.create({
    ...normalizeVendorInput(req.body),
    userId: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: "Vendor profile created successfully.",
    vendor,
  });
});

export const getVendors = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 12, 1),
    50,
  );
  const filters = {};

  if (req.query.category) filters.serviceCategory = req.query.category;
  if (req.query.verified === "true") filters.verified = true;
  if (req.query.location) {
    filters.location = {
      $regex: String(req.query.location).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }
  if (req.query.search) filters.$text = { $search: req.query.search };

  const sort =
    req.query.sort === "price_asc"
      ? { pricing: 1 }
      : req.query.sort === "price_desc"
        ? { pricing: -1 }
        : { verified: -1, rating: -1, createdAt: -1 };

  const [vendors, total] = await Promise.all([
    Vendor.find(filters)
      .populate("userId", "name email phone")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Vendor.countDocuments(filters),
  ]);

  res.status(200).json({
    success: true,
    count: vendors.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    vendors,
  });
});

export const getVendorById = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "vendor id");

  const vendor = await Vendor.findById(req.params.id).populate(
    "userId",
    "name email phone",
  );

  if (!vendor) throw new ApiError(404, "Vendor not found.");

  res.status(200).json({ success: true, vendor });
});

export const updateVendorProfile = asyncHandler(async (req, res) => {
  const updates = normalizeVendorInput(req.body);

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "Provide at least one vendor field to update.");
  }

  const vendor = await Vendor.findOneAndUpdate(
    { userId: req.user._id },
    updates,
    { new: true, runValidators: true },
  );

  if (!vendor) {
    throw new ApiError(404, "Vendor profile not found.");
  }

  res.status(200).json({
    success: true,
    message: "Vendor profile updated successfully.",
    vendor,
  });
});

export const deleteVendorProfile = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id });

  if (!vendor) {
    throw new ApiError(404, "Vendor profile not found.");
  }

  const activeBookings = await Booking.exists({
    vendorId: vendor._id,
    status: { $in: ["pending", "accepted"] },
  });

  if (activeBookings) {
    throw new ApiError(
      409,
      "Resolve or cancel active bookings before deleting the vendor profile.",
    );
  }

  await vendor.deleteOne();

  res.status(200).json({
    success: true,
    message: "Vendor profile deleted successfully.",
  });
});
