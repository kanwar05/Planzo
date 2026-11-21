import { Router } from "express";
import { protect, authorizeRoles, requireVerifiedEmail } from "../middleware/authMiddleware.js";
import { createSupportCase, listBookingSupportCases, getSupportCase, getSupportCaseEvents,
  addSupportCaseUpdate, addPrivateNote, listAdminSupportCases, manageSupportCase } from "../controllers/supportCaseController.js";

const router = Router();
const authenticated = [protect, authorizeRoles("customer", "vendor", "admin")];
const admin = [protect, authorizeRoles("admin")];
router.post("/bookings/:bookingId/support-cases", protect, authorizeRoles("customer", "vendor"), requireVerifiedEmail, createSupportCase);
router.get("/bookings/:bookingId/support-cases", ...authenticated, listBookingSupportCases);
router.get("/support/cases/:caseId", ...authenticated, getSupportCase);
router.get("/support/cases/:caseId/events", ...authenticated, getSupportCaseEvents);
router.post("/support/cases/:caseId/updates", ...authenticated, requireVerifiedEmail, addSupportCaseUpdate);
router.get("/admin/support/cases", ...admin, listAdminSupportCases);
router.patch("/admin/support/cases/:caseId", ...admin, manageSupportCase);
router.post("/admin/support/cases/:caseId/notes", ...admin, addPrivateNote);
export default router;
