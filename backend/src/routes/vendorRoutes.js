import { Router } from "express";
import { getVendor, getVendors, saveVendorProfile } from "../controllers/vendorController.js";
import { allowRoles, protect } from "../middleware/auth.js";

const router = Router();

router.get("/", getVendors);
router.get("/:id", getVendor);
router.put("/profile/me", protect, allowRoles("vendor"), saveVendorProfile);

export default router;

