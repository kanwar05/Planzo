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

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "planzo/vendors/portfolio",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8,
  },
  fileFilter(req, file, callback) {
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
  },
});

export const uploadPortfolioImages = (req, res, next) => {
  if (!isCloudinaryConfigured()) {
    return next(
      new ApiError(500, "Cloudinary image uploads are not configured."),
    );
  }

  return upload.array("images", 8)(req, res, next);
};
