import Favorite from "../models/Favorite.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";

const FAVORITE_VENDOR_FIELDS =
  "businessName serviceCategory location pricing rating reviewsCount averageRating reviewCount profileImage verified";

const normalizeFavorite = (favorite) => {
  const vendor = favorite.vendorId;

  return {
    _id: favorite._id,
    customerId: favorite.customerId,
    createdAt: favorite.createdAt,
    vendorId: vendor
      ? {
          ...vendor,
          category: vendor.serviceCategory,
          startingPrice: vendor.pricing,
        }
      : null,
  };
};

const getVendorOrThrow = async (vendorId) => {
  validateObjectId(vendorId, "vendor id");

  const vendor = await Vendor.findById(vendorId).select("userId businessName");
  if (!vendor) throw new ApiError(404, "Vendor not found.");

  return vendor;
};

export const addFavorite = asyncHandler(async (req, res) => {
  const vendor = await getVendorOrThrow(req.params.vendorId);

  if (String(vendor.userId) === String(req.user._id)) {
    throw new ApiError(400, "You cannot favorite your own vendor profile.");
  }

  try {
    await Favorite.create({
      customerId: req.user._id,
      vendorId: vendor._id,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "This vendor is already in your favorites.");
    }
    throw error;
  }

  res.status(201).json({
    success: true,
    message: "Vendor added to favorites.",
    isFavorited: true,
  });
});

export const removeFavorite = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const favorite = await Favorite.findOneAndDelete({
    customerId: req.user._id,
    vendorId: req.params.vendorId,
  });

  if (!favorite) {
    throw new ApiError(404, "This vendor is not in your favorites.");
  }

  res.status(200).json({
    success: true,
    message: "Vendor removed from favorites.",
    isFavorited: false,
  });
});

export const getFavorites = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ customerId: req.user._id })
    .sort({ createdAt: -1 })
    .populate({
      path: "vendorId",
      select: FAVORITE_VENDOR_FIELDS,
      options: { lean: true },
    })
    .lean();

  res.status(200).json({
    success: true,
    count: favorites.length,
    favorites: favorites.map(normalizeFavorite).filter((item) => item.vendorId),
  });
});

export const checkFavorite = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");

  const isFavorited = await Favorite.exists({
    customerId: req.user._id,
    vendorId: req.params.vendorId,
  });

  res.status(200).json({
    isFavorited: Boolean(isFavorited),
  });
});
