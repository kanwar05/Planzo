import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import cloudinary, {
  isCloudinaryConfigured,
} from "../config/cloudinary.js";
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
];

function normalizeVendorInput(body) {
  const data = pick(body, EDITABLE_FIELDS);

  if (data.experience !== undefined) {
    data.experience = toNonNegativeNumber(data.experience, "Experience");
  }
  if (data.pricing !== undefined) {
    data.pricing = toNonNegativeNumber(data.pricing, "Pricing");
  }
  return data;
}

const destroyCloudinaryImages = async (files = []) => {
  await Promise.allSettled(
    files
      .map((file) => file.filename)
      .filter(Boolean)
      .map((publicId) => cloudinary.uploader.destroy(publicId)),
  );
};

export const requireVendorProfile = asyncHandler(async (req, res, next) => {
  const vendor = await Vendor.findOne({ userId: req.user._id });

  if (!vendor) {
    throw new ApiError(
      404,
      "Please create your vendor profile before uploading portfolio images.",
    );
  }

  req.vendorProfile = vendor;
  next();
});

export const addPortfolioImages = asyncHandler(async (req, res) => {
  const files = req.files || [];

  if (!files.length) {
    throw new ApiError(400, 'Please upload at least one image using the "images" field.');
  }

  if (req.vendorProfile.portfolioImages.length + files.length > 8) {
    await destroyCloudinaryImages(files);
    throw new ApiError(400, "A portfolio can contain at most 8 images.");
  }

  const uploadedImages = files.map((file) => ({
    url: file.path,
    publicId: file.filename,
  }));

  try {
    const vendor = await Vendor.findOneAndUpdate(
      {
        _id: req.vendorProfile._id,
        $expr: {
          $lte: [
            { $size: { $ifNull: ["$portfolioImages", []] } },
            8 - files.length,
          ],
        },
      },
      { $push: { portfolioImages: { $each: uploadedImages } } },
      { new: true, runValidators: true },
    );

    if (!vendor) {
      await destroyCloudinaryImages(files);
      throw new ApiError(400, "A portfolio can contain at most 8 images.");
    }

    return res.status(200).json({
      success: true,
      message: "Portfolio images uploaded successfully.",
      vendor,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      await destroyCloudinaryImages(files);
    }
    throw error;
  }
});

export const removePortfolioImage = asyncHandler(async (req, res) => {
  const imageUrl =
    typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

  if (!imageUrl) {
    throw new ApiError(400, "imageUrl is required.");
  }

  const vendor = await Vendor.findOne({ userId: req.user._id });

  if (!vendor) {
    throw new ApiError(404, "Vendor profile not found.");
  }

  const image = vendor.portfolioImages.find((item) => item.url === imageUrl);

  if (!image) {
    throw new ApiError(404, "Portfolio image not found.");
  }

  if (image.publicId) {
    if (!isCloudinaryConfigured()) {
      throw new ApiError(500, "Cloudinary image uploads are not configured.");
    }

    const result = await cloudinary.uploader.destroy(image.publicId);

    if (!["ok", "not found"].includes(result.result)) {
      throw new ApiError(502, "Cloudinary could not delete the portfolio image.");
    }
  }

  vendor.portfolioImages = vendor.portfolioImages.filter(
    (item) => item.url !== imageUrl,
  );
  await vendor.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: "Portfolio image deleted successfully.",
    vendor,
  });
});

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

export const getMyVendorProfile = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id }).populate(
    "userId",
    "name email phone",
  );

  if (!vendor) throw new ApiError(404, "Vendor profile not found.");

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
