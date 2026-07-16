import { Router } from "express";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";
import { uploadTypedVerificationDocuments } from "../middleware/upload.js";
import { getMyVerification, submitVerification } from "../controllers/vendorVerificationController.js";

const router = Router();
router.use(protect, authorizeRoles("vendor"));
router.get("/me", getMyVerification);
router.post("/submit", uploadTypedVerificationDocuments, submitVerification);
export default router;
