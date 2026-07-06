import { Router } from "express";
import {
  createAvailability,
  deleteAvailability,
  getAvailability,
  updateAvailability,
} from "../controllers/availabilityController.js";
import {
  addPortfolioImages,
  createVendorProfile,
  deleteVendorProfile,
  getMyVendorProfile,
  getVendorById,
  getVendors,
  removeCoverImage,
  removePortfolioImage,
  removeProfileImage,
  replaceCoverImage,
  replaceProfileImage,
  requireVendorProfile,
  submitVerificationDocuments,
  updateVendorProfile,
  updateVendorImages,
} from "../controllers/vendorController.js";
import {
  authorizeRoles,
  protect,
} from "../middleware/authMiddleware.js";
import {
  uploadCoverImage,
  uploadPortfolioImages,
  uploadProfileImage,
  uploadVerificationDocuments,
  uploadVendorImages,
} from "../middleware/upload.js";
import { getVendorReviews } from "../controllers/reviewController.js";

const router = Router();

router.get("/", getVendors);
router.get("/:id/availability", getAvailability);
router.post(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  createAvailability,
);
router.put(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  updateAvailability,
);
router.delete(
  "/availability",
  protect,
  authorizeRoles("vendor"),
  deleteAvailability,
);
router.get("/:vendorId/reviews", getVendorReviews);
router.get(
  "/me",
  protect,
  authorizeRoles("vendor"),
  getMyVendorProfile,
);
router.post(
  "/profile",
  protect,
  authorizeRoles("vendor"),
  createVendorProfile,
);
router.patch(
  "/profile",
  protect,
  authorizeRoles("vendor"),
  updateVendorProfile,
);
router.delete(
  "/profile",
  protect,
  authorizeRoles("vendor"),
  deleteVendorProfile,
);
router.post(
  "/verification-documents",
  protect,
  authorizeRoles("vendor"),
  requireVendorProfile,
  uploadVerificationDocuments,
  submitVerificationDocuments,
);
router.post(
  "/images",
  protect,
  authorizeRoles("vendor"),
  requireVendorProfile,
  uploadVendorImages,
  updateVendorImages,
);
router.put(
  "/profile-image",
  protect,
  authorizeRoles("vendor"),
  requireVendorProfile,
  uploadProfileImage,
  replaceProfileImage,
);
router.delete(
  "/profile-image",
  protect,
  authorizeRoles("vendor"),
  removeProfileImage,
);
router.put(
  "/cover-image",
  protect,
  authorizeRoles("vendor"),
  requireVendorProfile,
  uploadCoverImage,
  replaceCoverImage,
);
router.delete(
  "/cover-image",
  protect,
  authorizeRoles("vendor"),
  removeCoverImage,
);
router.post(
  "/portfolio",
  protect,
  authorizeRoles("vendor"),
  requireVendorProfile,
  uploadPortfolioImages,
  addPortfolioImages,
);
router.delete(
  "/portfolio",
  protect,
  authorizeRoles("vendor"),
  removePortfolioImage,
);
router.get("/:id", getVendorById);

export default router;
