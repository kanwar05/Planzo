import { Router } from "express";
import {
  verifyVendor, rejectVendor, getUnverifiedVendors, getVendorsForAdmin, getUsers,
  getBookingsForAdmin, getAdminStats, editBooking, setUserSuspension, setVendorSuspension,
} from "../controllers/adminController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";

const router = Router();
router.use(protect, authorizeRoles("admin"));
router.get("/stats", getAdminStats);
router.get("/users", getUsers);
router.get("/vendors", getVendorsForAdmin);
router.get("/vendors/unverified", getUnverifiedVendors);
router.patch("/vendors/:vendorId/verify", verifyVendor);
router.patch("/vendors/:vendorId/reject", rejectVendor);
router.patch("/vendors/:vendorId/suspension", setVendorSuspension);
router.patch("/users/:userId/suspension", setUserSuspension);
router.get("/bookings", getBookingsForAdmin);
router.patch("/bookings/:bookingId", editBooking);
export default router;
