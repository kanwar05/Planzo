import { Router } from "express";
import {
  getNotifications,
  getNotificationStats,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// All notification routes require authentication
router.use(protect);

router.get("/stats", getNotificationStats);
router.get("/", getNotifications);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);
router.delete("/", deleteAllNotifications);
router.delete("/:id", deleteNotification);

export default router;
