import Booking from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import Availability from "../models/Availability.js";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  requireFields,
  validateObjectId,
} from "../utils/validation.js";
import { normalizeVendorInput, assertExpectedVendorRevision, vendorRevisionFilter, vendorReviewChanges } from "../services/vendorProfileService.js";
import { withBookingTransaction, lockVendorForBooking, lockAccountForBooking } from "../utils/vendorBookingTransaction.js";
import {
  getVendorSearchMeta,
  searchVendors,
  hasActiveVendorOwner,
  vendorView,
} from "../services/vendorSearchService.js";

async function commitVendorChanges(vendor, changes) {
  const updated = await Vendor.findOneAndUpdate(
    { _id: vendor._id, userId: vendor.userId, ...vendorRevisionFilter(vendor) },
    { $set: { ...changes, ...vendorReviewChanges(vendor, changes) }, $inc: { profileRevision: 1 } },
    { new: true, runValidators: true },
  ).select("+contactDetails +profileRevision");
  if (!updated) throw new ApiError(409, "The profile changed. Reload it before saving or uploading again.");
  return updated;
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
    console.error(
      "One or more replaced Cloudinary images could not be deleted.",
    );
  }
};

export const requireVendorProfile = asyncHandler(async (req, res, next) => {
  const vendor = await Vendor.findOne({ userId: req.user._id }).select(
    "+contactDetails +profileRevision",
  );

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

  const changes = {};
  if (profileFile) changes.profileImage = toCloudinaryImage(profileFile);
  if (coverFile) changes.coverImage = toCloudinaryImage(coverFile);
  if (portfolioFiles.length) changes.portfolioImages = [...vendor.portfolioImages.map((image) => image.toObject ? image.toObject() : image), ...portfolioFiles.map(toCloudinaryImage)];
  let updated;
  try {
    updated = await commitVendorChanges(vendor, changes);
  } catch (error) {
    await destroyCloudinaryImages(uploadedFiles);
    throw error;
  }

  await removeReplacedAssets(replacedImages);

  res.status(200).json({
    success: true,
    message: "Vendor images uploaded successfully.",
    vendor: vendorView(updated, { owner: true }),
  });
});

const replaceSingleVendorImage = (field, label) =>
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, `Upload an image using the "${field}" field.`);
    }

    const vendor = req.vendorProfile;
    const oldImage = vendor[field];
    let updated;
    try {
      updated = await commitVendorChanges(vendor, { [field]: toCloudinaryImage(req.file) });
    } catch (error) {
      await destroyCloudinaryImages([req.file]);
      throw error;
    }

    await removeReplacedAssets([oldImage]);

    res.status(200).json({
      success: true,
      message: `${label} uploaded successfully.`,
      vendor: vendorView(updated, { owner: true }),
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
    const vendor = await Vendor.findOne({ userId: req.user._id }).select(
      "+contactDetails +profileRevision",
    );

    if (!vendor) throw new ApiError(404, "Vendor profile not found.");
    if (!vendor[field]) throw new ApiError(404, `${label} not found.`);

    const oldImage = vendor[field];
    if (oldImage.publicId && !isCloudinaryConfigured()) throw new ApiError(503, "Cloudinary image uploads are not configured.");
    const updated = await commitVendorChanges(vendor, { [field]: null });
    await removeReplacedAssets([oldImage]);

    res.status(200).json({
      success: true,
      message: `${label} deleted successfully.`,
      vendor: vendorView(updated, { owner: true }),
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
    throw new ApiError(
      400,
      'Please upload at least one image using the "images" field.',
    );
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
    const vendor = await commitVendorChanges(req.vendorProfile, {
      portfolioImages: [...req.vendorProfile.portfolioImages.map((image) => image.toObject ? image.toObject() : image), ...uploadedImages],
    });

    return res.status(200).json({
      success: true,
      message: "Portfolio images uploaded successfully.",
      vendor: vendorView(vendor, { owner: true }),
    });
  } catch (error) {
    await destroyCloudinaryImages(files);
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

  const vendor = await Vendor.findOne({ userId: req.user._id }).select(
    "+contactDetails +profileRevision",
  );

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

  if (image.publicId && !isCloudinaryConfigured()) throw new ApiError(503, "Cloudinary image uploads are not configured.");
  const updated = await commitVendorChanges(vendor, {
    portfolioImages: vendor.portfolioImages.filter((item) => item.url !== image.url).map((item) => item.toObject ? item.toObject() : item),
  });
  await removeReplacedAssets([image]);

  res.status(200).json({
    success: true,
    message: "Portfolio image deleted successfully.",
    vendor: vendorView(updated, { owner: true }),
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

  const existingProfile = await Vendor.findOne({ userId: req.user._id }).select(
    "+contactDetails +profileRevision",
  );
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
    vendor: vendorView(vendor, { owner: true }),
  });
});

export const getVendors = asyncHandler(async (req, res) => {
  const result = await searchVendors(req.query);
  res.set("Cache-Control", "no-store");

  res.status(200).json({
    success: true,
    count: result.vendors.length,
    ...result,
  });
});

export const getVendorSearchMetadata = asyncHandler(async (req, res) => {
  const result = await getVendorSearchMeta(String(req.query.q || "").trim());

  res.json({ success: true, ...result });
});

export const getVendorById = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "vendor id");
  const vendor = await Vendor.findById(req.params.id);
  if (!(await hasActiveVendorOwner(vendor)))
    throw new ApiError(404, "Vendor not found.");
  res.set("Cache-Control", "no-store");
  res.status(200).json({ success: true, vendor: vendorView(vendor) });
});

export const getMyVendorProfile = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id }).select(
    "+contactDetails +profileRevision",
  );

  if (!vendor) throw new ApiError(404, "Vendor profile not found.");

  res
    .status(200)
    .json({ success: true, vendor: vendorView(vendor, { owner: true }) });
});

export const updateVendorProfile = asyncHandler(async (req, res) => {
  const updates = normalizeVendorInput(req.body);

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "Provide at least one vendor field to update.");
  }

  const vendor = await Vendor.findOne({ userId: req.user._id }).select(
    "+contactDetails +profileRevision",
  );
  if (!vendor) throw new ApiError(404, "Vendor profile not found.");
  assertExpectedVendorRevision(req.body, vendor);
  if (updates.contactDetails) updates.contactDetails = { phone: vendor.contactDetails?.phone || "", email: vendor.contactDetails?.email || "", ...updates.contactDetails };
  const updated = await commitVendorChanges(vendor, updates);

  res.status(200).json({
    success: true,
    message: "Vendor profile updated successfully.",
    vendor: vendorView(updated, { owner: true }),
  });
});

export const deleteVendorProfile = asyncHandler(async (req, res) => {
  const images = await withBookingTransaction(async (session) => {
    await lockAccountForBooking(req.user._id, session);
    const owned = await Vendor.findOne({ userId: req.user._id }).session(session);
    if (!owned) throw new ApiError(404, "Vendor profile not found.");
    const vendor = await lockVendorForBooking(owned._id, session, req.user._id);
    if (await Booking.exists({ vendorId: vendor._id }).session(session))
      throw new ApiError(409, "Profiles with booking history cannot be deleted. Contact support to deactivate the account.");
    const assets = [vendor.profileImage, vendor.coverImage, ...vendor.portfolioImages].filter((image) => image?.publicId);
    if (assets.length && !isCloudinaryConfigured()) throw new ApiError(503, "Cloudinary must be configured before deleting this vendor profile.");
    await Availability.deleteOne({ vendorId: vendor._id }).session(session);
    await Vendor.deleteOne({ _id: vendor._id, userId: req.user._id }).session(session);
    return assets;
  });
  // Cloudinary cannot join the transaction. Delete only detached assets after
  // commit; a provider outage must not erase an image still used by a booking.
  await removeReplacedAssets(images);

  res.status(200).json({
    success: true,
    message: "Vendor profile deleted successfully.",
  });
});
