import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";

const imageTypes = new Map([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"]]);
const ownedAsset = Symbol("uploadedCloudinaryAsset");

function imageStorage(folder) {
  return {
    _handleFile(req, file, callback) {
      const targetFolder = typeof folder === "function" ? folder(file) : folder;
      const publicId = `${targetFolder}/${randomUUID()}`;
      let completed = false;
      let inputFailed = false;
      let stream;
      const remove = async () => cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
      const cleanFailure = () => remove().catch(() => {
        console.error("Cloudinary could not clean up an incomplete business photo.");
      });
      const detach = () => {
        req.removeListener("aborted", abortInput);
        req.res?.removeListener("close", abortResponse);
        file.stream.removeListener("error", abortInput);
      };
      const abortInput = () => {
        if (inputFailed || completed) return;
        inputFailed = true;
        detach();
        stream?.destroy();
        void cleanFailure();
      };
      const abortResponse = () => { if (!req.res.writableEnded) abortInput(); };
      const finish = async (error, result) => {
        // Multer handles source/request errors itself. A late provider result still needs cleanup.
        if (inputFailed) { await cleanFailure(); return; }
        if (completed) return;
        completed = true;
        detach();
        if (!error && (typeof result?.secure_url !== "string" || !result.secure_url.startsWith("https://") || result.public_id !== publicId)) {
          error = new ApiError(502, "Image hosting returned an invalid upload response.");
        }
        if (error) {
          await cleanFailure();
          callback(new ApiError(502, "The business photo could not be uploaded."));
          return;
        }
        callback(null, { path: result.secure_url, filename: publicId, size: result.bytes, [ownedAsset]: publicId });
      };
      req.once("aborted", abortInput);
      req.res?.once("close", abortResponse);
      file.stream.once("error", abortInput);
      try {
        stream = cloudinary.uploader.upload_stream({
          public_id: publicId,
          resource_type: "image", // Cloudinary decodes the image, rejecting disguised files.
          allowed_formats: ["jpg", "jpeg", "png", "webp"],
          overwrite: false,
          transformation: [{ quality: "auto" }],
        }, (error, result) => { void finish(error, result); });
        stream.once("error", (error) => { void finish(error); });
        file.stream.pipe(stream);
      } catch (error) {
        void finish(error);
      }
    },
    _removeFile(req, file, callback) {
      // Never accept deletion targets from multipart fields or client-supplied filenames.
      const publicId = file[ownedAsset];
      if (!publicId) return callback(null);
      delete file[ownedAsset];
      delete file.path;
      delete file.filename;
      Promise.resolve().then(() => cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true }))
        .then(() => callback(null), callback);
    },
  };
}

const uploader = (folder, files) => multer({
  storage: imageStorage(folder),
  limits: { fileSize: 5 * 1024 * 1024, files, fields: 0, parts: files },
  fileFilter(req, file, callback) {
    const expected = imageTypes.get(path.extname(file.originalname || "").toLowerCase());
    if (!expected || expected !== file.mimetype) return callback(new ApiError(400, "Only JPG, JPEG, PNG, and WEBP images are allowed."));
    return callback(null, true);
  },
});

const configuredUpload = (handler) => (req, res, next) => {
  if (!isCloudinaryConfigured()) return next(new ApiError(503, "Cloudinary image uploads are not configured."));
  handler(req, res, next);
};

// Preserve image field names and asset folders for existing profiles.
export const uploadVendorImages = configuredUpload(uploader((file) => `eventifyy/vendors/${file.fieldname}`, 10).fields([
  { name: "profileImage", maxCount: 1 }, { name: "coverImage", maxCount: 1 }, { name: "portfolioImages", maxCount: 8 },
]));
export const uploadProfileImage = configuredUpload(uploader("eventifyy/vendors/profile", 1).single("profileImage"));
export const uploadCoverImage = configuredUpload(uploader("eventifyy/vendors/cover", 1).single("coverImage"));
export const uploadPortfolioImages = configuredUpload(uploader("eventifyy/vendors/portfolio", 8).array("images", 8));
