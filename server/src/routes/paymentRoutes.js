import { Router } from "express";
import {
  createOrder,
  getBookingPayments,
  getInvoice,
  getReceipt,
  getVendorSettlements,
  verifyCheckout,
} from "../controllers/paymentController.js";
import { authorizeRoles, protect, requireVerifiedEmail } from "../middleware/authMiddleware.js";

const router = Router();
router.use(protect);
router.get("/bookings/:bookingId", authorizeRoles("customer"), getBookingPayments);
router.post("/bookings/:bookingId/orders", authorizeRoles("customer"), requireVerifiedEmail, createOrder);
router.post("/verify", authorizeRoles("customer"), requireVerifiedEmail, verifyCheckout);
router.get("/bookings/:bookingId/invoice", authorizeRoles("customer"), getInvoice);
router.get("/:paymentId/receipt", authorizeRoles("customer"), getReceipt);
router.get("/vendor/settlements", authorizeRoles("vendor"), getVendorSettlements);
export default router;
