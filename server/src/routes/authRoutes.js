import { Router } from "express";
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  resetPassword,
  updateNotificationPreferences,
  updateProfile,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", protect, getMe);
router.patch("/profile", protect, updateProfile);
router.patch("/password", protect, changePassword);
router.patch(
  "/notification-preferences",
  protect,
  updateNotificationPreferences,
);
router.delete("/account", protect, deleteAccount);

export default router;
