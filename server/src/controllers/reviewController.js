import Booking from "../models/Booking.js";
import Review from "../models/Review.js";
import Vendor from "../models/Vendor.js";
import cloudinary from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { recalculateVendorRating } from "../utils/reviewRating.js";
import {
  requireFields,
  validateObjectId,
} from "../utils/validation.js";
import { safeCreateNotification } from "./notificationController.js";
import {
  historyEntry,
  inspectReviewText,
} from "../services/reviewModerationService.js";

const MAX_REVIEW_IMAGES = 4;

const populateReview = (review) =>
  review.populate([
    { path: "customerId", select: "name" },
    { path: "vendorId", select: "businessName userId" },
    { path: "bookingId", select: "eventType eventDate status" },
  ]);

const toReviewImage = (file) => ({
  url: file.path,
  publicId: file.filename,
});

const destroyImages = async (images = []) => {
  await Promise.allSettled(
    images
      .map((image) => image.publicId || image.filename)
      .filter(Boolean)
      .map((publicId) =>
        cloudinary.uploader.destroy(publicId, {
          resource_type: "image",
          invalidate: true,
        }),
      ),
  );
};

const parseRating = (value) => {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, "Rating must be a whole number from 1 to 5.");
  }
  return rating;
};

const parseRemovedImageIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map(String);
  } catch {
    throw new ApiError(400, "removeImagePublicIds must be a JSON array.");
  }
};

export const createReview = asyncHandler(async (req, res) => {
  requireFields(req.body, ["bookingId", "rating", "comment"]);
  validateObjectId(req.body.bookingId, "booking id");

  const files = req.files || [];
  if (files.length > MAX_REVIEW_IMAGES) {
    await destroyImages(files);
    throw new ApiError(400, "A review can contain at most 4 images.");
  }

  const booking = await Booking.findById(req.body.bookingId);
  if (!booking) {
    await destroyImages(files);
    throw new ApiError(404, "Booking not found.");
  }
  if (String(booking.customerId) !== String(req.user._id)) {
    await destroyImages(files);
    throw new ApiError(403, "You can only review your own booking.");
  }
  if (booking.status !== "completed") {
    await destroyImages(files);
    throw new ApiError(409, "Only completed bookings can be reviewed.");
  }

  const vendor = await Vendor.findById(booking.vendorId);
  if (!vendor) {
    await destroyImages(files);
    throw new ApiError(404, "Vendor not found.");
  }
  if (String(vendor.userId) === String(req.user._id)) {
    await destroyImages(files);
    throw new ApiError(400, "Vendors cannot review themselves.");
  }

  const moderation = inspectReviewText(req.body.comment);
  let review;
  try {
    review = await Review.create({
      customerId: req.user._id,
      vendorId: booking.vendorId,
      bookingId: booking._id,
      rating: parseRating(req.body.rating),
      comment: String(req.body.comment).trim(),
      images: files.map(toReviewImage),
      status: moderation.shouldFlag ? "flagged" : "active",
      flaggedAt: moderation.shouldFlag ? new Date() : null,
      moderationReason: moderation.shouldFlag
        ? "Automatically queued by text moderation."
        : null,
      automatedModeration: {
        profanity: moderation.profanity,
        spamReasons: moderation.spamReasons,
        checkedAt: new Date(),
      },
      moderationHistory: moderation.shouldFlag
        ? [historyEntry({
            action: "auto_flagged",
            fromStatus: "active",
            toStatus: "flagged",
            reason: "Automated spam/profanity detection.",
            details: moderation,
          })]
        : [],
    });
  } catch (error) {
    await destroyImages(files);
    if (error.code === 11000) {
      throw new ApiError(409, "This booking has already been reviewed.");
    }
    throw error;
  }

  // Notify vendor of new review
  await safeCreateNotification(
    vendor.userId,
    "review_created",
    "New Review Received",
    `You received a new review from a customer with ${parseRating(req.body.rating)} stars.`,
    { reviewId: review._id, vendorId: booking.vendorId },
  );

  await recalculateVendorRating(review.vendorId);
  await populateReview(review);

  res.status(201).json({
    success: true,
    message: moderation.shouldFlag
      ? "Review submitted and queued for moderation."
      : "Review published successfully.",
    review,
  });
});

export const getVendorReviews = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
    50,
  );

  const [reviews, total] = await Promise.all([
    Review.find({ vendorId: req.params.vendorId, status: "active" })
      .populate("customerId", "name")
      .populate("bookingId", "eventType eventDate")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments({ vendorId: req.params.vendorId, status: "active" }),
  ]);

  const publicReviews = reviews.map((review) => {
    const value = review.toObject();
    value.images = value.images.filter((image) => image.moderationStatus === "approved");
    return value;
  });
  res.status(200).json({
    success: true,
    count: reviews.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    reviews: publicReviews,
  });
});

export const getBookingReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.bookingId, "booking id");

  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");

  const vendor = await Vendor.findById(booking.vendorId).select("userId");
  const isCustomer = String(booking.customerId) === String(req.user._id);
  const isVendor = vendor && String(vendor.userId) === String(req.user._id);

  if (!isCustomer && !isVendor && req.user.role !== "admin") {
    throw new ApiError(403, "You cannot view this booking review.");
  }

  const review = await Review.findOne({ bookingId: booking._id })
    .populate("customerId", "name")
    .populate("vendorId", "businessName userId")
    .populate("bookingId", "eventType eventDate status");

  res.status(200).json({
    success: true,
    review: review || null,
  });
});

export const updateReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "review id");

  const review = await Review.findById(req.params.id);
  const newFiles = req.files || [];

  if (!review) {
    await destroyImages(newFiles);
    throw new ApiError(404, "Review not found.");
  }
  if (String(review.customerId) !== String(req.user._id)) {
    await destroyImages(newFiles);
    throw new ApiError(403, "You can only edit your own review.");
  }

  let removeIds;
  try {
    removeIds = parseRemovedImageIds(req.body.removeImagePublicIds);
  } catch (error) {
    await destroyImages(newFiles);
    throw error;
  }
  const removableImages = review.images.filter((image) =>
    removeIds.includes(image.publicId),
  );
  const keptImages = review.images.filter(
    (image) => !removeIds.includes(image.publicId),
  );

  if (keptImages.length + newFiles.length > MAX_REVIEW_IMAGES) {
    await destroyImages(newFiles);
    throw new ApiError(400, "A review can contain at most 4 images.");
  }

  if (req.body.rating !== undefined) {
    try {
      review.rating = parseRating(req.body.rating);
    } catch (error) {
      await destroyImages(newFiles);
      throw error;
    }
  }
  if (req.body.comment !== undefined) {
    review.comment = String(req.body.comment).trim();
    const moderation = inspectReviewText(review.comment);
    review.automatedModeration = {
      profanity: moderation.profanity,
      spamReasons: moderation.spamReasons,
      checkedAt: new Date(),
    };
    if (moderation.shouldFlag && review.status === "active") {
      review.moderationHistory.push(historyEntry({
        action: "auto_flagged_after_edit",
        fromStatus: "active",
        toStatus: "flagged",
        reason: "Automated spam/profanity detection.",
        details: moderation,
      }));
      review.status = "flagged";
      review.flaggedAt = new Date();
      review.moderationReason = "Automatically queued after review edit.";
    }
  }
  review.images = [...keptImages, ...newFiles.map(toReviewImage)];

  try {
    await review.save();
  } catch (error) {
    await destroyImages(newFiles);
    throw error;
  }

  await destroyImages(removableImages);
  await recalculateVendorRating(review.vendorId);
  await populateReview(review);

  res.status(200).json({
    success: true,
    message: "Review updated successfully.",
    review,
  });
});

export const deleteReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "review id");

  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, "Review not found.");
  if (String(review.customerId) !== String(req.user._id)) {
    throw new ApiError(403, "You can only delete your own review.");
  }

  const { vendorId, images } = review;
  await review.deleteOne();
  await Promise.all([
    recalculateVendorRating(vendorId),
    destroyImages(images),
  ]);

  res.status(200).json({
    success: true,
    message: "Review deleted successfully.",
  });
});

export const replyToReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "review id");
  requireFields(req.body, ["message"]);

  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, "Review not found.");

  const vendor = await Vendor.findById(review.vendorId).select("userId");
  if (!vendor || String(vendor.userId) !== String(req.user._id)) {
    throw new ApiError(403, "You can only reply to reviews for your profile.");
  }

  review.vendorReply = {
    message: String(req.body.message).trim(),
    repliedAt: new Date(),
    editedAt: review.vendorReply ? new Date() : null,
    history: review.vendorReply
      ? [
          ...(review.vendorReply.history || []),
          { message: review.vendorReply.message, changedAt: new Date() },
        ]
      : [],
  };
  review.moderationHistory.push(historyEntry({
    action: review.vendorReply.history.length ? "vendor_response_edited" : "vendor_response_added",
    actor: req.user,
  }));
  await review.save();
  await populateReview(review);

  // Notify customer that vendor replied to their review
  await safeCreateNotification(
    review.customerId,
    "vendor_replied",
    "Vendor Replied to Your Review",
    `The vendor has replied to your review.`,
    { reviewId: review._id, vendorId: review.vendorId },
  );

  res.status(200).json({
    success: true,
    message: "Reply saved successfully.",
    review,
  });
});

export const reportReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "review id");
  requireFields(req.body, ["reason"]);
  const review = await Review.findById(req.params.id);
  if (!review || review.status === "removed") throw new ApiError(404, "Review not found.");
  if (review.reports.some((report) => String(report.reporterId) === String(req.user._id))) {
    throw new ApiError(409, "You have already reported this review.");
  }

  const fromStatus = review.status;
  review.reports.push({ reporterId: req.user._id, reason: String(req.body.reason).trim() });
  review.status = "flagged";
  review.flaggedAt = new Date();
  review.moderationReason = "Reported by a community member.";
  review.moderationHistory.push(historyEntry({
    action: "reported",
    actor: req.user,
    fromStatus,
    toStatus: "flagged",
    reason: String(req.body.reason).trim(),
  }));
  await review.save();
  if (fromStatus === "active") await recalculateVendorRating(review.vendorId);

  res.status(201).json({ success: true, message: "Review reported for moderation." });
});

export const appealReview = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "review id");
  requireFields(req.body, ["message"]);
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, "Review not found.");
  const vendor = await Vendor.findById(review.vendorId).select("userId");
  const mayAppeal =
    String(review.customerId) === String(req.user._id) ||
    String(vendor?.userId) === String(req.user._id);
  if (!mayAppeal) throw new ApiError(403, "Only the review author or vendor may appeal.");
  if (!["flagged", "hidden", "removed"].includes(review.status)) {
    throw new ApiError(409, "Only moderated reviews can be appealed.");
  }
  if (review.appeal?.status === "pending") throw new ApiError(409, "An appeal is already pending.");

  review.appeal = {
    message: String(req.body.message).trim(),
    status: "pending",
    submittedBy: req.user._id,
    submittedAt: new Date(),
  };
  review.moderationHistory.push(historyEntry({
    action: "appeal_submitted",
    actor: req.user,
    reason: String(req.body.message).trim(),
  }));
  await review.save();
  res.status(201).json({ success: true, message: "Appeal submitted.", appeal: review.appeal });
});

export const getReviewHistory = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "review id");
  const review = await Review.findById(req.params.id).select(
    "customerId vendorId moderationHistory vendorReply.history appeal status",
  );
  if (!review) throw new ApiError(404, "Review not found.");
  const vendor = await Vendor.findById(review.vendorId).select("userId");
  const allowed =
    req.user.role === "admin" ||
    String(review.customerId) === String(req.user._id) ||
    String(vendor?.userId) === String(req.user._id);
  if (!allowed) throw new ApiError(403, "You cannot view this review history.");
  res.status(200).json({
    success: true,
    status: review.status,
    moderationHistory: review.moderationHistory,
    vendorResponseHistory: review.vendorReply?.history || [],
    appeal: review.appeal,
  });
});
