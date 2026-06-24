import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getVendorRequests,
  updateBookingStatus,
} from "../controllers/bookingController.js";
import {
  authorizeRoles,
  protect,
} from "../middleware/authMiddleware.js";
import { getBookingReview } from "../controllers/reviewController.js";

const router = Router();

router.use(protect);

router.post("/", authorizeRoles("customer"), createBooking);
router.get(
  "/my-bookings",
  authorizeRoles("customer"),
  getMyBookings,
);
router.get(
  "/vendor-requests",
  authorizeRoles("vendor"),
  getVendorRequests,
);
router.get("/:bookingId/review", getBookingReview);
router.patch("/:id/status", updateBookingStatus);

export default router;
