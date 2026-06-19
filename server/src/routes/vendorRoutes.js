import { Router } from "express";
import {
  createVendorProfile,
  deleteVendorProfile,
  getMyVendorProfile,
  getVendorById,
  getVendors,
  updateVendorProfile,
} from "../controllers/vendorController.js";
import {
  authorizeRoles,
  protect,
} from "../middleware/authMiddleware.js";

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
router.get("/:id", getVendorById);

export default router;
