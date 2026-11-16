import { Router } from "express";
import { createPackage, deactivatePackage, editPackage, getMyPackages, getPublicPackages } from "../controllers/packageController.js";
import { authorizeRoles, protect, requireVerifiedEmail } from "../middleware/authMiddleware.js";

const router = Router();
router.get("/packages/mine", protect, authorizeRoles("vendor"), getMyPackages);
router.post("/packages", protect, authorizeRoles("vendor"), requireVerifiedEmail, createPackage);
router.patch("/packages/:packageId", protect, authorizeRoles("vendor"), requireVerifiedEmail, editPackage);
router.delete("/packages/:packageId", protect, authorizeRoles("vendor"), requireVerifiedEmail, deactivatePackage);
router.get("/:vendorId/packages", getPublicPackages);
export default router;
