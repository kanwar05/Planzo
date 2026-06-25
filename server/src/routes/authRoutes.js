import { Router } from "express";
import {
  forgotPassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  resetPassword,
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

export default router;
