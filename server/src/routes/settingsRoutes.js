import { Router } from "express";
import {
  deactivateAccount,
  getSettings,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updateSettings,
} from "../controllers/settingsController.js";
import { deleteAccount } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();
router.use(protect);
router.get("/", getSettings);
router.patch("/", updateSettings);
router.get("/sessions", listSessions);
router.delete("/sessions/others", revokeOtherSessions);
router.delete("/sessions/:id", revokeSession);
router.post("/deactivate", deactivateAccount);
router.delete("/account", deleteAccount);

export default router;
