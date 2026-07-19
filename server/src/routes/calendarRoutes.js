import { Router } from "express";
import {
  beginGoogleOAuth,
  disconnectCalendar,
  exportBookings,
  getCalendarStatus,
  googleOAuthCallback,
  syncGoogleCalendar,
} from "../controllers/calendarController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/google/callback", googleOAuthCallback);
router.use(protect, authorizeRoles("vendor"));
router.get("/status", getCalendarStatus);
router.post("/google/connect", beginGoogleOAuth);
router.post("/sync", syncGoogleCalendar);
router.delete("/connection", disconnectCalendar);
router.get("/export", exportBookings);

export default router;
