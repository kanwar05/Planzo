import { Router } from "express";
import {
  createVendorProfile,
  deleteVendorProfile,
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
