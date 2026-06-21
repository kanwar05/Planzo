import { Router } from "express";
import {
  addPortfolioImages,
  createVendorProfile,
  deleteVendorProfile,
  getMyVendorProfile,
  getVendorById,
  getVendors,
  removePortfolioImage,
  requireVendorProfile,
  updateVendorProfile,
} from "../controllers/vendorController.js";
import {
  authorizeRoles,
  protect,
} from "../middleware/authMiddleware.js";
import { uploadPortfolioImages } from "../middleware/upload.js";

const router = Router();

router.get("/", getVendors);
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
