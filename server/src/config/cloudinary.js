import { v2 as cloudinary } from "cloudinary";
import { assertStagingImageDeletion } from "./stagingSafety.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );

export default cloudinary;

export function destroyOwnedImage(publicId, options) {
  assertStagingImageDeletion(publicId);
  return cloudinary.uploader.destroy(publicId, options);
}
