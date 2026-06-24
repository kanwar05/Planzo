import { Router } from "express";
import {
  createReview,
  deleteReview,
  replyToReview,
  updateReview,
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

export default router;
