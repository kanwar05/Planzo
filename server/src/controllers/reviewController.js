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

  let review;
  try {
    review = await Review.create({
      customerId: req.user._id,
      vendorId: booking.vendorId,
      bookingId: booking._id,
      rating: parseRating(req.body.rating),
      comment: String(req.body.comment).trim(),
      images: files.map(toReviewImage),
    });
  } catch (error) {
    await destroyImages(files);
    if (error.code === 11000) {
      throw new ApiError(409, "This booking has already been reviewed.");
    }
    throw error;
  }

  await recalculateVendorRating(review.vendorId);
  await populateReview(review);

  res.status(201).json({
    success: true,
    message: "Review published successfully.",
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
    Review.find({ vendorId: req.params.vendorId })
      .populate("customerId", "name")
      .populate("bookingId", "eventType eventDate")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Review.countDocuments({ vendorId: req.params.vendorId }),
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
  };
  await review.save();
  await populateReview(review);

  res.status(200).json({
    success: true,
    message: "Reply saved successfully.",
    review,
  });
});
