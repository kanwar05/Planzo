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

const toCloudinaryImage = (file) => ({
  url: file.path,
  publicId: file.filename,
});

const flattenUploadedFiles = (files) =>
  Array.isArray(files) ? files : Object.values(files || {}).flat();

const destroyCloudinaryAsset = async (publicId, label = "image") => {
  if (!publicId) return;

  if (!isCloudinaryConfigured()) {
    throw new ApiError(503, "Cloudinary image uploads are not configured.");
  }

  let result;
  try {
    result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  } catch {
    throw new ApiError(502, `Cloudinary could not delete the ${label}.`);
  }

  if (!["ok", "not found"].includes(result.result)) {
    throw new ApiError(502, `Cloudinary could not delete the ${label}.`);
  }
};

const removeReplacedAssets = async (images) => {
  const results = await Promise.allSettled(
    images
      .filter((image) => image?.publicId)
      .map((image) => destroyCloudinaryAsset(image.publicId, "old image")),
  );

  if (results.some((result) => result.status === "rejected")) {
    console.error("One or more replaced Cloudinary images could not be deleted.");
  }
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

export const updateVendorImages = asyncHandler(async (req, res) => {
  const files = req.files || {};
  const profileFile = files.profileImage?.[0];
  const coverFile = files.coverImage?.[0];
  const portfolioFiles = files.portfolioImages || [];
  const uploadedFiles = flattenUploadedFiles(files);

  if (!uploadedFiles.length) {
    throw new ApiError(
      400,
      "Upload profileImage, coverImage, or portfolioImages.",
    );
  }

  const vendor = req.vendorProfile;
  if (vendor.portfolioImages.length + portfolioFiles.length > 8) {
    await destroyCloudinaryImages(uploadedFiles);
    throw new ApiError(400, "A portfolio can contain at most 8 images.");
  }

  const replacedImages = [];
  if (profileFile && vendor.profileImage) {
    replacedImages.push(vendor.profileImage);
  }
  if (coverFile && vendor.coverImage) {
    replacedImages.push(vendor.coverImage);
  }

  if (profileFile) vendor.profileImage = toCloudinaryImage(profileFile);
  if (coverFile) vendor.coverImage = toCloudinaryImage(coverFile);
  if (portfolioFiles.length) {
    vendor.portfolioImages.push(...portfolioFiles.map(toCloudinaryImage));
  }

  try {
    await vendor.save();
  } catch (error) {
    await destroyCloudinaryImages(uploadedFiles);
    throw error;
  }

  await removeReplacedAssets(replacedImages);

  res.status(200).json({
    success: true,
    message: "Vendor images uploaded successfully.",
    vendor,
  });
});

const replaceSingleVendorImage = (field, label) =>
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, `Upload an image using the "${field}" field.`);
    }

    const vendor = req.vendorProfile;
    const oldImage = vendor[field];
    vendor[field] = toCloudinaryImage(req.file);

    try {
      await vendor.save();
    } catch (error) {
      await destroyCloudinaryImages([req.file]);
      throw error;
    }

    await removeReplacedAssets([oldImage]);

    res.status(200).json({
      success: true,
      message: `${label} uploaded successfully.`,
      vendor,
    });
  });

export const replaceProfileImage = replaceSingleVendorImage(
  "profileImage",
  "Profile image",
);
export const replaceCoverImage = replaceSingleVendorImage(
  "coverImage",
  "Cover image",
);

const deleteSingleVendorImage = (field, label) =>
  asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({ userId: req.user._id });

    if (!vendor) throw new ApiError(404, "Vendor profile not found.");
    if (!vendor[field]) throw new ApiError(404, `${label} not found.`);

    await destroyCloudinaryAsset(vendor[field].publicId, label.toLowerCase());
    vendor[field] = null;
    await vendor.save();

    res.status(200).json({
      success: true,
      message: `${label} deleted successfully.`,
      vendor,
    });
  });

export const removeProfileImage = deleteSingleVendorImage(
  "profileImage",
  "Profile image",
);
export const removeCoverImage = deleteSingleVendorImage(
  "coverImage",
  "Cover image",
);

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
  const publicId =
    typeof req.body.publicId === "string" ? req.body.publicId.trim() : "";
  const imageUrl =
    typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

  if (!publicId && !imageUrl) {
    throw new ApiError(400, "publicId or imageUrl is required.");
  }

  const vendor = await Vendor.findOne({ userId: req.user._id });

  if (!vendor) {
    throw new ApiError(404, "Vendor profile not found.");
  }

  const image = vendor.portfolioImages.find(
    (item) =>
      (publicId && item.publicId === publicId) ||
      (imageUrl && item.url === imageUrl),
  );

  if (!image) {
    throw new ApiError(404, "Portfolio image not found.");
  }

  if (image.publicId) {
    await destroyCloudinaryAsset(image.publicId, "portfolio image");
  }

  vendor.portfolioImages = vendor.portfolioImages.filter(
    (item) => item.url !== image.url,
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

  const images = [
    vendor.profileImage,
    vendor.coverImage,
    ...vendor.portfolioImages,
  ].filter((image) => image?.publicId);

  if (images.length) {
    if (!isCloudinaryConfigured()) {
      throw new ApiError(
        503,
        "Cloudinary must be configured before deleting this vendor profile.",
      );
    }

    const results = await Promise.allSettled(
      images.map((image) =>
        destroyCloudinaryAsset(image.publicId, "vendor image"),
      ),
    );

    if (results.some((result) => result.status === "rejected")) {
      throw new ApiError(
        502,
        "Vendor profile was not deleted because some Cloudinary images could not be removed.",
      );
    }
  }

  await vendor.deleteOne();

  res.status(200).json({
    success: true,
    message: "Vendor profile deleted successfully.",
  });
});
