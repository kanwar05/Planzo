import { Router } from "express";
import {
  verifyVendor,
  rejectVendor,
  unverifyVendor,
  getUnverifiedVendors,
  deleteReview,
  flagReview,
  getReviewsForModeration,
  getBookingsForAdmin,
  getReportedVendors,
  reportVendor,
  resolveVendorReport,
  getAdminStats,
} from "../controllers/adminController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";
import { getVerification, listVerifications, reviewVerification } from "../controllers/vendorVerificationController.js";
import { listCancellations, reviewRefund } from "../controllers/cancellationController.js";

const router = Router();

// All admin routes require authentication and admin role
router.use(protect, authorizeRoles("admin"));

// Dashboard stats
router.get("/stats", getAdminStats);
router.get("/cancellations", listCancellations);
router.patch("/cancellations/:id/refund", reviewRefund);

// Vendor management
router.get("/vendors/unverified", getUnverifiedVendors);
router.get("/verifications", listVerifications);
router.get("/verifications/:id", getVerification);
router.patch("/verifications/:id/review", reviewVerification);
router.patch("/vendors/:vendorId/verify", verifyVendor);
router.patch("/vendors/:vendorId/reject", rejectVendor);
router.patch("/vendors/:vendorId/unverify", unverifyVendor);

// Reported vendors
router.get("/vendors/reported", getReportedVendors);
router.post("/vendors/:vendorId/report", reportVendor);
router.patch("/vendors/:vendorId/report-resolution", resolveVendorReport);

// Review moderation
router.get("/reviews", getReviewsForModeration);
router.delete("/reviews/:reviewId", deleteReview);
router.post("/reviews/:reviewId/flag", flagReview);

// Booking viewing
router.get("/bookings", getBookingsForAdmin);

export default router;
