import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getVendorRequests,
  updateBookingStatus,
} from "../controllers/bookingController.js";
import { authorizeRoles, protect, requireVerifiedEmail } from "../middleware/authMiddleware.js";

const router = Router();
router.use(protect);
router.post("/", authorizeRoles("customer"), requireVerifiedEmail, createBooking);
router.get("/my-bookings", authorizeRoles("customer"), getMyBookings);
router.get("/vendor-requests", authorizeRoles("vendor"), getVendorRequests);
router.patch("/:id/status", (req, res, next) => {
  if (req.user.role === "vendor") return requireVerifiedEmail(req, res, next);
  return next();
}, updateBookingStatus);
export default router;
