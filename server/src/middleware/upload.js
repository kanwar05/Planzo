import path from "node:path";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary, {
  isCloudinaryConfigured,
} from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const createStorage = (folder) =>
  new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: typeof folder === "function" ? folder(file) : folder,
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    }),
  });

const imageFileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !ALLOWED_EXTENSIONS.has(extension) ||
    !ALLOWED_MIME_TYPES.has(file.mimetype)
  ) {
    return callback(
      new ApiError(400, "Only JPG, JPEG, PNG, and WEBP images are allowed."),
    );
  }

  return callback(null, true);
};

const createUploader = (folder, files) =>
  multer({
    storage: createStorage(folder),
    limits: {
      fileSize: MAX_IMAGE_SIZE,
      files,
      fields: 10,
      parts: files + 10,
    },
    fileFilter: imageFileFilter,
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
      .map((file) => file.filename)
      .filter(Boolean)
      .map((publicId) =>
        cloudinary.uploader.destroy(publicId, {
          resource_type: "image",
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
