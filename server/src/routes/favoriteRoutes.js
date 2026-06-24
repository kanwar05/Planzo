import express from "express";
import {
  addFavorite,
  checkFavorite,
  getFavorites,
  removeFavorite,
} from "../controllers/favoriteController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("customer"));

router.get("/", getFavorites);
router.get("/check/:vendorId", checkFavorite);
router.post("/:vendorId", addFavorite);
router.delete("/:vendorId", removeFavorite);

export default router;
