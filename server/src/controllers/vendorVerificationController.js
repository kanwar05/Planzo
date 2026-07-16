import cloudinary from "../config/cloudinary.js";
import Vendor from "../models/Vendor.js";
import VendorVerification, { DOCUMENT_TYPES } from "../models/VendorVerification.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";

const REQUIRED_DOCUMENTS = ["governmentId", "businessLicense", "panCard", "profilePhoto"];

const clean = (verification) => verification?.toObject ? verification.toObject() : verification;

const removeAssets = async (documents) => Promise.allSettled(
  Object.values(documents || {}).filter(Boolean).map((doc) =>
    cloudinary.uploader.destroy(doc.publicId, {
      resource_type: doc.mimeType === "application/pdf" ? "raw" : "image",
      invalidate: true,
    }),
  ),
);

const findVendor = async (userId) => {
  const vendor = await Vendor.findOne({ userId });
  if (!vendor) throw new ApiError(404, "Create your vendor profile before verification.");
  return vendor;
};

export const getMyVerification = asyncHandler(async (req, res) => {
  const vendor = await findVendor(req.user._id);
  const verification = await VendorVerification.findOne({ vendor: vendor._id })
    .populate("reviewedBy", "name email")
    .populate("verificationHistory.changedBy", "name role");
  res.json({ success: true, verification: verification || null });
});

export const submitVerification = asyncHandler(async (req, res) => {
  const vendor = await findVendor(req.user._id);
  const files = req.files || {};
  const incoming = {};
  for (const type of DOCUMENT_TYPES) {
    const file = files[type]?.[0];
    if (file) incoming[type] = {
      url: file.path,
      publicId: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
  if (!Object.keys(incoming).length) throw new ApiError(400, "Upload at least one verification document.");

  let verification = await VendorVerification.findOne({ vendor: vendor._id });
  if (verification?.status === "approved") {
    await removeAssets(incoming);
    throw new ApiError(409, "Approved verification documents cannot be replaced.");
  }
  const merged = { ...(verification?.documents?.toObject?.() || {}), ...incoming };
  const missing = REQUIRED_DOCUMENTS.filter((type) => !merged[type]);
  if (missing.length) {
    await removeAssets(incoming);
    throw new ApiError(400, `Missing required documents: ${missing.join(", ")}.`);
  }

  const names = Object.values(merged).filter(Boolean).map((doc) => doc.originalName.toLowerCase());
  if (new Set(names).size !== names.length) {
    await removeAssets(incoming);
    throw new ApiError(409, "The same file cannot be used for multiple document types.");
  }

  const replaced = {};
  for (const type of Object.keys(incoming)) if (verification?.documents?.[type]) replaced[type] = verification.documents[type];
  if (!verification) verification = new VendorVerification({ vendor: vendor._id });
  for (const [type, doc] of Object.entries(incoming)) verification.documents[type] = doc;
  verification.status = "pending";
  verification.reason = "";
  verification.reviewedBy = null;
  verification.reviewedAt = null;
  verification.submittedAt = new Date();
  verification.verificationHistory.push({ status: "pending", reason: "Documents submitted", changedBy: req.user._id });
  await verification.save();

  vendor.verificationStatus = "pending";
  vendor.verificationRejectionReason = "";
  vendor.verificationSubmittedAt = verification.submittedAt;
  vendor.verified = false;
  await vendor.save();
  await removeAssets(replaced);
  res.status(200).json({ success: true, message: "Verification submitted for review.", verification: clean(verification) });
});

export const listVerifications = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = req.query.status ? { status: req.query.status } : {};
  const [verifications, total] = await Promise.all([
    VendorVerification.find(filter).populate({ path: "vendor", populate: { path: "userId", select: "name email phone" } }).populate("reviewedBy", "name email").sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit),
    VendorVerification.countDocuments(filter),
  ]);
  res.json({ success: true, verifications, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const getVerification = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "verification id");
  const verification = await VendorVerification.findById(req.params.id).populate({ path: "vendor", populate: { path: "userId", select: "name email phone" } }).populate("reviewedBy", "name email").populate("verificationHistory.changedBy", "name role");
  if (!verification) throw new ApiError(404, "Verification not found.");
  res.json({ success: true, verification });
});

export const reviewVerification = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "verification id");
  const action = req.body?.status;
  if (!["approved", "rejected", "needs_resubmission"].includes(action)) throw new ApiError(400, "Invalid review status.");
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (action !== "approved" && !reason) throw new ApiError(400, "A reason is required.");
  const verification = await VendorVerification.findById(req.params.id);
  if (!verification) throw new ApiError(404, "Verification not found.");
  if (verification.status !== "pending") throw new ApiError(409, "Only pending submissions can be reviewed.");
  verification.status = action;
  verification.reason = reason;
  verification.reviewedBy = req.user._id;
  verification.reviewedAt = new Date();
  verification.verificationHistory.push({ status: action, reason, changedBy: req.user._id });
  await verification.save();
  await Vendor.findByIdAndUpdate(verification.vendor, {
    verified: action === "approved",
    verificationStatus: action === "needs_resubmission" ? "rejected" : action,
    verificationRejectionReason: reason,
  });
  res.json({ success: true, message: `Verification ${action.replace("_", " ")}.`, verification });
});
