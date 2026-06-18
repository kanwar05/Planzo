import { Router } from "express";
import { createBooking, getMyBookings } from "../controllers/bookingController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);
router.route("/").post(createBooking).get(getMyBookings);

export default router;

