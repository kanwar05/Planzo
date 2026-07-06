import path from "node:path";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary, {
  isCloudinaryConfigured,
} from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const DOCUMENT_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ".pdf"]);
const DOCUMENT_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  "application/pdf",
]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const getCloudinaryResourceType = (file) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  return extension === ".pdf" ? "raw" : "image";
};

const createStorage = (folder, options = {}) =>
  new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: typeof folder === "function" ? folder(file) : folder,
      resource_type: options.resourceType || "image",
      allowed_formats: options.allowedFormats || ["jpg", "jpeg", "png", "webp"],
      ...(options.resourceType === "image"
        ? { transformation: [{ quality: "auto", fetch_format: "auto" }] }
        : {}),
    }),
  });

const imageFileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !IMAGE_EXTENSIONS.has(extension) ||
    !IMAGE_MIME_TYPES.has(file.mimetype)
  ) {
    return callback(
      new ApiError(400, "Only JPG, JPEG, PNG, and WEBP images are allowed."),
    );
  }

  return callback(null, true);
};

const documentFileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !DOCUMENT_EXTENSIONS.has(extension) ||
    !DOCUMENT_MIME_TYPES.has(file.mimetype)
  ) {
    return callback(
      new ApiError(400, "Only JPG, JPEG, PNG, WEBP, and PDF files are allowed."),
    );
  }

  return callback(null, true);
};

const createUploader = (folder, files, fileFilter = imageFileFilter, options = {}) =>
  multer({
    storage: createStorage(folder, options),
    limits: {
      fileSize: MAX_IMAGE_SIZE,
      files,
      fields: 10,
      parts: files + 10,
    },
    fileFilter,
  });

const cleanupRequestUploads = async (req) => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files)
      ? req.files
      : Object.values(req.files || {}).flat()),
  ];

  await Promise.allSettled(
    files
      .map((file) => ({ publicId: file.filename, resourceType: getCloudinaryResourceType(file) }))
      .filter((file) => file.publicId)
      .map((file) =>
        cloudinary.uploader.destroy(file.publicId, {
          resource_type: file.resourceType,
          invalidate: true,
        }),
      ),
  );
};

const ensureCloudinaryConfigured = (uploadHandler) => (req, res, next) => {
  if (!isCloudinaryConfigured()) {
    return next(
      new ApiError(503, "Cloudinary image uploads are not configured."),
    );
  }

  return uploadHandler(req, res, async (error) => {
    if (error) {
      await cleanupRequestUploads(req);
      return next(error);
    }

    return next();
  });
};

export const uploadVendorImages = ensureCloudinaryConfigured(
  createUploader(
    (file) => `planzo/vendors/${file.fieldname}`,
    10,
  ).fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "portfolioImages", maxCount: 8 },
  ]),
);

export const uploadProfileImage = ensureCloudinaryConfigured(
  createUploader("planzo/vendors/profile", 1).single("profileImage"),
);

export const uploadCoverImage = ensureCloudinaryConfigured(
  createUploader("planzo/vendors/cover", 1).single("coverImage"),
);

// Keep the original field name for backwards compatibility with the frontend.
export const uploadPortfolioImages = ensureCloudinaryConfigured(
  createUploader("planzo/vendors/portfolio", 8).array("images", 8),
);

export const uploadVerificationDocuments = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();

  return ensureCloudinaryConfigured(
    createUploader(
      "planzo/vendors/verification",
      5,
      documentFileFilter,
      { resourceType: "raw", allowedFormats: ["pdf", "jpg", "jpeg", "png", "webp"] },
    ).array("documents", 5),
  )(req, res, next);
};

const reviewImageUpload = createUploader(
  "planzo/reviews",
  4,
).array("images", 4);

export const uploadReviewImages = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();

  return ensureCloudinaryConfigured(reviewImageUpload)(req, res, next);
};
