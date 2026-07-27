import { Router } from "express";
import {
  createReview,
  deleteReview,
  replyToReview,
  updateReview,
  reportReview,
  appealReview,
  getReviewHistory,
} from "../controllers/reviewController.js";
import {
  authorizeRoles,
  protect,
} from "../middleware/authMiddleware.js";
import { uploadReviewImages } from "../middleware/upload.js";

const router = Router();

router.use(protect);

router.post(
  "/",
  authorizeRoles("customer"),
  uploadReviewImages,
  createReview,
);
router.patch(
  "/:id",
  authorizeRoles("customer"),
  uploadReviewImages,
  updateReview,
);
router.delete("/:id", authorizeRoles("customer"), deleteReview);
router.patch("/:id/reply", authorizeRoles("vendor"), replyToReview);
router.post("/:id/report", reportReview);
router.post("/:id/appeal", authorizeRoles("customer", "vendor"), appealReview);
router.get("/:id/history", getReviewHistory);

export default router;
