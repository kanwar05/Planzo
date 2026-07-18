import { Router } from "express";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";
import { cancelBooking, disputeCancellation, getCancellation, vendorCancellationHistory } from "../controllers/cancellationController.js";
const router = Router(); router.use(protect);
router.get("/vendor-history", authorizeRoles("vendor"), vendorCancellationHistory);
router.post("/:id/cancel", cancelBooking);
router.get("/:id/cancellation", getCancellation);
router.post("/:id/cancellation/dispute", authorizeRoles("customer", "vendor"), disputeCancellation);
export default router;
