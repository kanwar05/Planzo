import { Router } from "express";
import {
  getAdminDashboard,
  getCustomerDashboard,
  getVendorDashboard,
} from "../controllers/analyticsController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);

router.get("/customer", authorizeRoles("customer"), getCustomerDashboard);
router.get("/vendor", authorizeRoles("vendor"), getVendorDashboard);
router.get("/admin", authorizeRoles("admin"), getAdminDashboard);

export default router;
