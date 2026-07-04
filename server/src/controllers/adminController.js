import Vendor from "../models/Vendor.js";
import Review from "../models/Review.js";
import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { requireFields, validateObjectId } from "../utils/validation.js";

// Verify vendor
export const verifyVendor = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const vendor = await Vendor.findByIdAndUpdate(
    req.params.vendorId,
    { verified: true },
    { new: true },
  );

  if (!vendor) {
    throw new ApiError(404, "Vendor not found.");
  }

  res.status(200).json({
    success: true,
    message: "Vendor verified successfully.",
    vendor,
  });
});

// Unverify vendor
export const unverifyVendor = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const vendor = await Vendor.findByIdAndUpdate(
    req.params.vendorId,
    { verified: false },
    { new: true },
  );

  if (!vendor) {
    throw new ApiError(404, "Vendor not found.");
  }

  res.status(200).json({
    success: true,
    message: "Vendor unverified.",
    vendor,
  });
});

// Get all unverified vendors
export const getUnverifiedVendors = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100,
  );

  const [vendors, total] = await Promise.all([
    Vendor.find({ verified: false })
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Vendor.countDocuments({ verified: false }),
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

// Moderate review (delete/flag)
export const deleteReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.reviewId, "review id");

  const review = await Review.findByIdAndDelete(req.params.reviewId);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  // Update vendor rating
  const vendorId = review.vendorId;
  const reviews = await Review.find({ vendorId });
  const avg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;
  await Vendor.findByIdAndUpdate(vendorId, {
    averageRating: avg,
    reviewCount: reviews.length,
  });

  res.status(200).json({
    success: true,
    message: "Review deleted successfully.",
  });
});

// Flag review for inappropriate content
export const flagReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.reviewId, "review id");
  requireFields(req.body, ["moderationReason"]);

  const review = await Review.findById(req.params.reviewId);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  review.status = "flagged";
  review.flaggedAt = new Date();
  review.moderationReason = String(req.body.moderationReason).trim();
  await review.save();

  res.status(200).json({
    success: true,
    message: "Review flagged for moderation.",
    review,
  });
});

// Get all reviews for moderation
export const getReviewsForModeration = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100,
  );

  const [reviews, total] = await Promise.all([
    Review.find()
      .populate("customerId", "name email")
      .populate("vendorId", "businessName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    count: reviews.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    reviews,
  });
});

// Get all bookings for viewing
export const getBookingsForAdmin = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100,
  );
  const filters = {};

  if (req.query.status) {
    const status = String(req.query.status).toLowerCase();
    if (!BOOKING_STATUSES.includes(status)) {
      throw new ApiError(
        400,
        `Invalid status. Must be one of: ${BOOKING_STATUSES.join(", ")}.`,
      );
    }
    filters.status = status;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filters)
      .populate("customerId", "name email phone")
      .populate("vendorId", "businessName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Booking.countDocuments(filters),
  ]);

  res.status(200).json({
    success: true,
    count: bookings.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    bookings,
  });
});

// Get reported vendors
export const getReportedVendors = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100,
  );

  const [vendors, total] = await Promise.all([
    Vendor.find({ reported: true })
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Vendor.countDocuments({ reported: true }),
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

// Report vendor
export const reportVendor = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const { reason } = req.body;
  if (!reason || typeof reason !== "string") {
    throw new ApiError(400, "Reason is required.");
  }

  const vendor = await Vendor.findById(req.params.vendorId);
  if (!vendor) {
    throw new ApiError(404, "Vendor not found.");
  }

  if (!vendor.reported) {
    vendor.reported = true;
    vendor.reportReasons = [];
  }

  if (!vendor.reportReasons.includes(reason)) {
    vendor.reportReasons.push(reason);
  }

  await vendor.save();

  res.status(200).json({
    success: true,
    message: "Vendor reported successfully.",
    vendor,
  });
});

// Handle reported vendor (dismiss report or suspend)
export const resolveVendorReport = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const { action } = req.body;
  if (!["dismiss", "suspend"].includes(action)) {
    throw new ApiError(400, "Action must be 'dismiss' or 'suspend'.");
  }

  const vendor = await Vendor.findById(req.params.vendorId);
  if (!vendor) {
    throw new ApiError(404, "Vendor not found.");
  }

  if (action === "dismiss") {
    vendor.reported = false;
    vendor.reportReasons = [];
  } else if (action === "suspend") {
    vendor.suspended = true;
    vendor.suspendedAt = new Date();
    vendor.verified = false;
    vendor.reported = false;
    vendor.reportReasons = [];
  }

  await vendor.save();

  res.status(200).json({
    success: true,
    message: `Vendor report ${action}ed successfully.`,
    vendor,
  });
});

// Get admin dashboard stats
export const getAdminStats = asyncHandler(async (req, res) => {
  const [
    totalVendors,
    unverifiedVendors,
    reportedVendors,
    totalBookings,
    totalReviews,
    totalUsers,
  ] = await Promise.all([
    Vendor.countDocuments(),
    Vendor.countDocuments({ verified: false }),
    Vendor.countDocuments({ reported: true }),
    Booking.countDocuments(),
    Review.countDocuments(),
    User.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      totalVendors,
      unverifiedVendors,
      reportedVendors,
      totalBookings,
      totalReviews,
      totalUsers,
    },
  });
});
