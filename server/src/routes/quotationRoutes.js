import { Router } from "express";
import { protect, authorizeRoles, requireVerifiedEmail } from "../middleware/authMiddleware.js";
import { acceptQuotation, createQuotation, getQuotations, rejectQuotation } from "../controllers/quotationController.js";

const router = Router();
router.get("/:bookingId/quotations", protect, getQuotations);
router.post("/:bookingId/quotations", protect, authorizeRoles("vendor"), requireVerifiedEmail, createQuotation);
router.post("/:bookingId/quotations/:revision/accept", protect, authorizeRoles("customer"), requireVerifiedEmail, acceptQuotation);
router.post("/:bookingId/quotations/:revision/reject", protect, authorizeRoles("customer"), requireVerifiedEmail, rejectQuotation);
export default router;
