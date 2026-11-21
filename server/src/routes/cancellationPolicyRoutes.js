import { Router } from "express";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";
import { getBookingPolicy, getCurrentPolicy, getPolicyHistory, publishPolicy } from "../controllers/cancellationPolicyController.js";
const router = Router();
router.get("/cancellation-policies", getCurrentPolicy);
router.get("/admin/cancellation-policies", protect, authorizeRoles("admin"), getPolicyHistory);
router.post("/admin/cancellation-policies", protect, authorizeRoles("admin"), publishPolicy);
router.get("/bookings/:bookingId/cancellation-policy", protect, getBookingPolicy);
export default router;
