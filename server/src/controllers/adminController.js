import Vendor from "../models/Vendor.js";
import Review from "../models/Review.js";
import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { requireFields, validateObjectId } from "../utils/validation.js";
import { sendVendorVerificationUpdateNotification } from "../services/transactionalNotificationService.js";
import { getAdminDashboardAnalytics } from "../services/analyticsService.js";
import { safeCreateNotification } from "./notificationController.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { recordAudit } from "../services/auditService.js";
import { recalculateVendorRating } from "../utils/reviewRating.js";
import { historyEntry } from "../services/reviewModerationService.js";

const updateVendorVerification = async (vendorId, status, reason = "") => {
  const vendor = await Vendor.findById(vendorId).populate(
    "userId",
    "name email phone notificationPreferences",
  );

  if (!vendor) {
    throw new ApiError(404, "Vendor not found.");
  }

  if (status === "approved" && !vendor.verificationDocuments?.length) {
    throw new ApiError(
      400,
      "Vendor must submit verification documents before approval.",
    );
  }

  const oldValue = { verificationStatus: vendor.verificationStatus, verified: vendor.verified };
  vendor.verificationStatus = status;
  vendor.verificationRejectionReason = status === "rejected" ? reason.trim() : "";
  vendor.verified = status === "approved";
  await vendor.save();

  await safeCreateNotification(
    vendor.userId._id,
    status === "approved"
      ? "vendor_verification_approved"
      : "vendor_verification_rejected",
    status === "approved" ? "Vendor Approved" : "Vendor Rejected",
    status === "approved"
      ? `Your vendor profile for ${vendor.businessName} was approved.`
      : `Your vendor profile for ${vendor.businessName} was rejected.${vendor.verificationRejectionReason ? ` Reason: ${vendor.verificationRejectionReason}` : ""}`,
    { vendorId: vendor._id },
  );

  await sendVendorVerificationUpdateNotification({
    vendorUser: vendor.userId,
    vendorName: vendor.businessName,
    status,
    reason: vendor.verificationRejectionReason,
  });

  return { vendor, oldValue };
};

// Verify vendor
export const verifyVendor = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const { vendor, oldValue } = await updateVendorVerification(req.params.vendorId, "approved");
  await recordAudit(req, {
    action: "vendor_approved", targetType: "Vendor", targetId: vendor._id,
    targetLabel: vendor.businessName, oldValue,
    newValue: { verificationStatus: "approved", verified: true },
    reason: String(req.body?.reason || "Verification requirements met."),
  });

  res.status(200).json({
    success: true,
    message: "Vendor verified successfully.",
    vendor,
  });
});

// Reject vendor
export const rejectVendor = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  const { vendor, oldValue } = await updateVendorVerification(
    req.params.vendorId,
    "rejected",
    reason || "No reason provided.",
  );
  await recordAudit(req, {
    action: "vendor_rejected", targetType: "Vendor", targetId: vendor._id,
    targetLabel: vendor.businessName, oldValue,
    newValue: { verificationStatus: "rejected", verified: false },
    reason: vendor.verificationRejectionReason,
  });

  res.status(200).json({
    success: true,
    message: "Vendor rejected successfully.",
    vendor,
  });
});

// Unverify vendor
export const unverifyVendor = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const { vendor, oldValue } = await updateVendorVerification(
    req.params.vendorId,
    "rejected",
    "No reason provided.",
  );
  await recordAudit(req, {
    action: "vendor_rejected", targetType: "Vendor", targetId: vendor._id,
    targetLabel: vendor.businessName, oldValue,
    newValue: { verificationStatus: "rejected", verified: false },
    reason: "No reason provided.",
  });

  res.status(200).json({
    success: true,
    message: "Vendor rejected successfully.",
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
    Vendor.find({ verificationStatus: "pending" })
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Vendor.countDocuments({ verificationStatus: "pending" }),
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

  const review = await Review.findById(req.params.reviewId);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  const oldValue = review.toObject();
  const fromStatus = review.status;
  review.status = "removed";
  review.moderationReason = String(req.body?.reason || "Removed by moderator.");
  review.moderationHistory.push(historyEntry({
    action: "removed",
    actor: req.user,
    fromStatus,
    toStatus: "removed",
    reason: review.moderationReason,
  }));
  await review.save();
  await recalculateVendorRating(review.vendorId);
  await recordAudit(req, {
    action: "review_deleted", targetType: "Review", targetId: review._id,
    targetLabel: `Review ${review._id}`, oldValue,
    newValue: review.toObject(), reason: review.moderationReason,
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

  const fromStatus = review.status;
  review.status = "flagged";
  review.flaggedAt = new Date();
  review.moderationReason = String(req.body.moderationReason).trim();
  review.moderationHistory.push(historyEntry({
    action: "flagged",
    actor: req.user,
    fromStatus,
    toStatus: "flagged",
    reason: review.moderationReason,
  }));
  await review.save();
  await recalculateVendorRating(review.vendorId);

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

  const filter = {};
  if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
  if (req.query.queue === "true") {
    filter.$or = [
      { status: { $in: ["flagged", "hidden"] } },
      { "appeal.status": "pending" },
      { "images.moderationStatus": "pending" },
    ];
  }
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate("customerId", "name email")
      .populate("vendorId", "businessName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments(filter),
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

export const moderateReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.reviewId, "review id");
  requireFields(req.body, ["action"]);
  const action = String(req.body.action);
  if (!["approve", "hide", "remove"].includes(action)) {
    throw new ApiError(400, "Action must be approve, hide, or remove.");
  }
  const reason = String(req.body.reason || "").trim();
  if (action !== "approve" && !reason) throw new ApiError(400, "A reason is required.");

  const review = await Review.findById(req.params.reviewId);
  if (!review) throw new ApiError(404, "Review not found.");
  const fromStatus = review.status;
  review.status = { approve: "active", hide: "hidden", remove: "removed" }[action];
  review.moderationReason = action === "approve" ? null : reason;
  review.flaggedAt = null;
  review.moderationHistory.push(historyEntry({
    action: action === "approve" ? "approved" : `${action}d`,
    actor: req.user,
    fromStatus,
    toStatus: review.status,
    reason,
  }));
  await review.save();
  await recalculateVendorRating(review.vendorId);
  res.status(200).json({ success: true, message: `Review ${action}d.`, review });
});

export const moderateReviewImages = asyncHandler(async (req, res) => {
  validateObjectId(req.params.reviewId, "review id");
  requireFields(req.body, ["publicIds", "decision"]);
  const publicIds = Array.isArray(req.body.publicIds) ? req.body.publicIds.map(String) : [];
  if (!["approved", "rejected"].includes(req.body.decision) || !publicIds.length) {
    throw new ApiError(400, "Provide image publicIds and an approved or rejected decision.");
  }
  const reason = String(req.body.reason || "").trim();
  if (req.body.decision === "rejected" && !reason) {
    throw new ApiError(400, "A rejection reason is required.");
  }
  const review = await Review.findById(req.params.reviewId);
  if (!review) throw new ApiError(404, "Review not found.");
  let matched = 0;
  review.images.forEach((image) => {
    if (publicIds.includes(image.publicId)) {
      image.moderationStatus = req.body.decision;
      image.moderationReason = reason || null;
      matched += 1;
    }
  });
  if (!matched) throw new ApiError(404, "No matching review images found.");
  review.moderationHistory.push(historyEntry({
    action: `images_${req.body.decision}`,
    actor: req.user,
    reason,
    details: { publicIds },
  }));
  await review.save();
  res.status(200).json({ success: true, message: "Image moderation saved.", review });
});

export const decideReviewAppeal = asyncHandler(async (req, res) => {
  validateObjectId(req.params.reviewId, "review id");
  requireFields(req.body, ["decision"]);
  if (!["approved", "rejected"].includes(req.body.decision)) {
    throw new ApiError(400, "Decision must be approved or rejected.");
  }
  const review = await Review.findById(req.params.reviewId);
  if (!review?.appeal || review.appeal.status !== "pending") {
    throw new ApiError(404, "No pending appeal found.");
  }
  const fromStatus = review.status;
  review.appeal.status = req.body.decision;
  review.appeal.decidedBy = req.user._id;
  review.appeal.decidedAt = new Date();
  review.appeal.decisionReason = String(req.body.reason || "").trim() || null;
  if (req.body.decision === "approved") {
    review.status = "active";
    review.moderationReason = null;
  }
  review.moderationHistory.push(historyEntry({
    action: `appeal_${req.body.decision}`,
    actor: req.user,
    fromStatus,
    toStatus: review.status,
    reason: review.appeal.decisionReason,
  }));
  await review.save();
  await recalculateVendorRating(review.vendorId);
  res.status(200).json({ success: true, message: "Appeal decision saved.", review });
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

export const editBooking = asyncHandler(async (req, res) => {
  validateObjectId(req.params.bookingId, "booking id");
  requireFields(req.body, ["reason"]);
  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const allowed = ["eventType", "eventDate", "eventDateOnly", "eventStartTime", "eventEndTime", "eventLocation", "budget", "specialRequirements", "status"];
  const changes = {};
  const oldValue = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      oldValue[field] = booking[field];
      booking[field] = req.body[field];
      changes[field] = booking[field];
    }
  }
  if (!Object.keys(changes).length) throw new ApiError(400, "Provide at least one booking field to edit.");
  await booking.save();
  await recordAudit(req, {
    action: "booking_edited", targetType: "Booking", targetId: booking._id,
    targetLabel: `${booking.eventType} booking`, oldValue, newValue: changes,
    reason: String(req.body.reason).trim(),
  });
  res.json({ success: true, message: "Booking updated.", booking });
});

export const setUserSuspension = asyncHandler(async (req, res) => {
  validateObjectId(req.params.userId, "user id");
  const suspended = req.body.suspended !== false;
  const reason = String(req.body.reason || "").trim();
  if (suspended && !reason) throw new ApiError(400, "A suspension reason is required.");
  if (String(req.user._id) === req.params.userId) throw new ApiError(400, "You cannot suspend your own account.");
  const user = await User.findById(req.params.userId);
  if (!user) throw new ApiError(404, "User not found.");
  const oldValue = { suspendedAt: user.suspendedAt, suspensionReason: user.suspensionReason };
  user.suspendedAt = suspended ? new Date() : null;
  user.suspensionReason = suspended ? reason : "";
  await user.save({ validateBeforeSave: false });
  if (suspended) await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await recordAudit(req, {
    action: suspended ? "user_suspended" : "user_unsuspended",
    targetType: "User", targetId: user._id, targetLabel: user.email,
    oldValue, newValue: { suspendedAt: user.suspendedAt, suspensionReason: user.suspensionReason },
    reason: reason || "Suspension removed.",
  });
  res.json({ success: true, message: suspended ? "User suspended." : "User suspension removed.", user });
});

export const changeUserRole = asyncHandler(async (req, res) => {
  validateObjectId(req.params.userId, "user id");
  requireFields(req.body, ["role", "reason"]);
  if (!["customer", "vendor", "admin"].includes(req.body.role)) throw new ApiError(400, "Invalid role.");
  if (String(req.user._id) === req.params.userId) throw new ApiError(400, "You cannot change your own role.");
  const user = await User.findById(req.params.userId);
  if (!user) throw new ApiError(404, "User not found.");
  const oldRole = user.role;
  user.role = req.body.role;
  await user.save({ validateBeforeSave: false });
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await recordAudit(req, {
    action: "role_changed", targetType: "User", targetId: user._id,
    targetLabel: user.email, oldValue: { role: oldRole }, newValue: { role: user.role },
    reason: String(req.body.reason).trim(),
  });
  res.json({ success: true, message: "User role updated.", user });
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
  const dashboard = await getAdminDashboardAnalytics(req.query);
  const totalReviews = await Review.countDocuments();

  res.status(200).json({
    success: true,
    stats: {
      totalVendors: dashboard.summary.vendors,
      unverifiedVendors: dashboard.summary.pendingVerification,
      reportedVendors: dashboard.recentReports.pagination.total,
      totalReviews,
      totalUsers: dashboard.summary.totalUsers,
      ...dashboard.summary,
    },
    dashboard,
  });
});
