import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import multer from "multer";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import { logEvent } from "../utils/logger.js";

const imageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);
const ownedAsset = Symbol("uploadedCloudinaryAsset");

function imageStorage(folder, { deliveryType } = {}) {
  return {
    _handleFile(req, file, callback) {
      const targetFolder = typeof folder === "function" ? folder(file) : folder;
      const publicId = `${targetFolder}/${randomUUID()}`;
      let completed = false;
      let inputFailed = false;
      let stream;
      let receivedBytes = 0;
      const checksum = deliveryType ? createHash("sha256") : null;
      const trackInput = chunk => { receivedBytes += chunk.length; checksum?.update(chunk); };
      const remove = async () =>
        cloudinary.uploader.destroy(publicId, {
          resource_type: "image",
          invalidate: true,
          ...(deliveryType ? { type: deliveryType } : {}),
        });
      const cleanFailure = () =>
        remove().catch(() => {
          logEvent("error", "image_cleanup_failed", { category: "incomplete_upload" });
        });
      const detach = () => {
        req.removeListener("aborted", abortInput);
        req.res?.removeListener("close", abortResponse);
        file.stream.removeListener("error", abortInput);
        file.stream.removeListener("data", trackInput);
      };
      const abortInput = () => {
        if (inputFailed || completed) return;
        inputFailed = true;
        detach();
        stream?.destroy();
        void cleanFailure();
      };
      const abortResponse = () => {
        if (!req.res.writableEnded) abortInput();
      };
      const finish = async (error, result) => {
        // Multer handles source/request errors itself. A late provider result still needs cleanup.
        if (inputFailed) {
          await cleanFailure();
          return;
        }
        if (completed) return;
        completed = true;
        detach();
        if (
          !error &&
          (typeof result?.secure_url !== "string" ||
            !result.secure_url.startsWith("https://") ||
            result.public_id !== publicId)
        ) {
          error = new ApiError(
            502,
            "Image hosting returned an invalid upload response.",
          );
        }
        if (error) {
          await cleanFailure();
          callback(
            new ApiError(502, deliveryType ? "The evidence image could not be uploaded." : "The business photo could not be uploaded."),
          );
          return;
        }
        callback(null, {
          path: deliveryType ? undefined : result.secure_url,
          filename: publicId,
          size: deliveryType ? receivedBytes : result.bytes,
          ...(deliveryType ? { deliveryType, sha256: checksum.digest("hex"),
            format: result.format === "jpeg" ? "jpg" : result.format || path.extname(file.originalname).slice(1).toLowerCase().replace(/^jpeg$/, "jpg") } : {}),
          [ownedAsset]: publicId,
        });
      };
      req.once("aborted", abortInput);
      req.res?.once("close", abortResponse);
      file.stream.once("error", abortInput);
      try {
        stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: "image", // Cloudinary decodes the image, rejecting disguised files.
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            overwrite: false,
            timeout: 30_000,
            ...(deliveryType ? { type: deliveryType } : { transformation: [{ quality: "auto" }] }),
          },
          (error, result) => {
            void finish(error, result);
          },
        );
        stream.once("error", (error) => {
          void finish(error);
        });
        if (deliveryType) file.stream.on("data", trackInput);
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
      Promise.resolve()
        .then(() =>
          cloudinary.uploader.destroy(publicId, {
            resource_type: "image",
            invalidate: true,
            ...(deliveryType ? { type: deliveryType } : {}),
          }),
        )
        .then(() => callback(null), callback);
    },
  };
}

const uploader = (folder, files, options = {}) =>
  multer({
    storage: imageStorage(folder, options),
    limits: { fileSize: 5 * 1024 * 1024, files, fields: options.fields || 0, parts: files + (options.fields || 0), fieldSize: 100 },
    fileFilter(req, file, callback) {
      const expected = imageTypes.get(
        path.extname(file.originalname || "").toLowerCase(),
      );
      if (!expected || expected !== file.mimetype)
        return callback(
          new ApiError(
            400,
            "Only JPG, JPEG, PNG, and WEBP images are allowed.",
          ),
        );
      return callback(null, true);
    },
  });

const configuredUpload = (handler) => (req, res, next) => {
  if (!isCloudinaryConfigured())
    return next(
      new ApiError(503, "Cloudinary image uploads are not configured."),
    );
  handler(req, res, next);
};

// Preserve image field names and asset folders for existing profiles.
export const uploadVendorImages = configuredUpload(
  uploader((file) => `eventifyy/vendors/${file.fieldname}`, 10).fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "portfolioImages", maxCount: 8 },
  ]),
);
export const uploadProfileImage = configuredUpload(
  uploader("eventifyy/vendors/profile", 1).single("profileImage"),
);
export const uploadCoverImage = configuredUpload(
  uploader("eventifyy/vendors/cover", 1).single("coverImage"),
);
export const uploadPortfolioImages = configuredUpload(
  uploader("eventifyy/vendors/portfolio", 8).array("images", 8),
);

// Evidence is authenticated media, never a public portfolio URL. Preserve the
// original bytes rather than applying a lossy presentation transformation.
export const uploadSupportEvidence = configuredUpload(
  uploader("planzo/support-evidence", 3, { deliveryType: "authenticated", fields: 1 }).array("evidence", 3),
);

export function supportEvidenceFileInfo(file) {
  const publicId = file?.[ownedAsset];
  if (!publicId || publicId !== file.filename || !/^planzo\/support-evidence\/[a-f0-9-]{36}$/.test(publicId) ||
      file.deliveryType !== "authenticated" || !["jpg", "png", "webp"].includes(file.format) ||
      !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 5 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(file.sha256 || "")) throw new ApiError(400, "Invalid evidence upload metadata.");
  return { publicId, format: file.format, bytes: file.size, sha256: file.sha256 };
}

export async function cleanupSupportEvidence(files = []) {
  const results = await Promise.allSettled(files.map(file => {
    const publicId = file?.[ownedAsset];
    if (!publicId || !/^planzo\/support-evidence\/[a-f0-9-]{36}$/.test(publicId)) return null;
    return cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
  }));
  if (results.some(result => result.status === "rejected" || result.value && !["ok", "not found"].includes(result.value.result)))
    logEvent("error", "support_evidence_cleanup_failed");
}
