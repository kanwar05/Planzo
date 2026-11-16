import { Router } from "express";
import {
  changePassword,
  confirmEmailChange,
  deleteAccount,
  forgotPassword,
  getMe,
  login,
  requestLoginOtp,
  logout,
  refresh,
  register,
  requestEmailChange,
  requestEmailVerification,
  resetPassword,
  verifyLoginOtp,
  verifyEmailOwnership,
  updateProfile,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/login/otp/request", requestLoginOtp);
router.post("/login/otp/verify", verifyLoginOtp);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", protect, getMe);
router.post("/email-verification/request", protect, requestEmailVerification);
router.post("/email-verification/verify", protect, verifyEmailOwnership);
router.patch("/profile", protect, updateProfile);
router.patch("/password", protect, changePassword);
router.post("/email-change", protect, requestEmailChange);
router.post("/email-change/confirm", confirmEmailChange);
router.delete("/account", protect, deleteAccount);

export default router;
