import Review from "../models/Review.js";
import Vendor from "../models/Vendor.js";

export const calculateAverageRating = (ratings = []) => {
  if (!ratings.length) return 0;

  const average =
    ratings.reduce((total, rating) => total + Number(rating), 0) /
    ratings.length;

  return Math.round(average * 10) / 10;
};

export const recalculateVendorRating = async (vendorId) => {
  const summary = await Review.aggregate([
    { $match: { vendorId } },
    {
      $group: {
        _id: "$vendorId",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const averageRating = summary.length
    ? Math.round(summary[0].averageRating * 10) / 10
    : 0;
  const reviewCount = summary[0]?.reviewCount || 0;

  await Vendor.findByIdAndUpdate(vendorId, {
    averageRating,
    reviewCount,
    // Keep legacy fields synchronized for existing clients and documents.
    rating: averageRating,
    reviewsCount: reviewCount,
  });

  return { averageRating, reviewCount };
};
