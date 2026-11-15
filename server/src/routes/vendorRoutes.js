import { Router } from "express";
import {
  createAvailability,
  deleteAvailability,
  getAvailability,
  getMyAvailability,
  updateAvailability,
} from "../controllers/availabilityController.js";
import {
  addPortfolioImages,
  createVendorProfile,
  deleteVendorProfile,
  getMyVendorProfile,
  getVendorById,
  getVendors,
  getVendorSearchMetadata,
  removeCoverImage,
  removePortfolioImage,
  removeProfileImage,
  replaceCoverImage,
  replaceProfileImage,
  requireVendorProfile,
  updateVendorProfile,
  updateVendorImages,
} from "../controllers/vendorController.js";
import { authorizeRoles, protect, requireVerifiedEmail } from "../middleware/authMiddleware.js";
import {
  uploadCoverImage,
  uploadPortfolioImages,
  uploadProfileImage,
  uploadVendorImages,
} from "../middleware/upload.js";

const router = Router();

router.get("/", getVendors);
router.get("/search/meta", getVendorSearchMetadata);
router.get("/categories", getVendorSearchMetadata);
router.get(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  getMyAvailability,
);
router.get("/:id/availability", getAvailability);
router.post(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  createAvailability,
);
router.put(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  updateAvailability,
);
router.delete(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  deleteAvailability,
);
router.get("/me", protect, authorizeRoles("vendor"), getMyVendorProfile);
router.post("/profile", protect, authorizeRoles("vendor"), requireVerifiedEmail, createVendorProfile);
router.patch(
  "/profile",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  updateVendorProfile,
);
router.delete(
  "/profile",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  deleteVendorProfile,
);
router.post(
  "/images",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  requireVendorProfile,
  uploadVendorImages,
  updateVendorImages,
);
router.put(
  "/profile-image",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  requireVendorProfile,
  uploadProfileImage,
  replaceProfileImage,
);
router.delete(
  "/profile-image",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  removeProfileImage,
);
router.put(
  "/cover-image",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  requireVendorProfile,
  uploadCoverImage,
  replaceCoverImage,
);
router.delete(
  "/cover-image",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  removeCoverImage,
);
router.post(
  "/portfolio",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  requireVendorProfile,
  uploadPortfolioImages,
  addPortfolioImages,
);
router.delete(
  "/portfolio",
  protect,
  authorizeRoles("vendor"),
  requireVerifiedEmail,
  removePortfolioImage,
);
router.get("/:id", getVendorById);

export default router;
