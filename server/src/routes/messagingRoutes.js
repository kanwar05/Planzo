import { Router } from "express";
import { protect, authorizeRoles, requireVerifiedEmail } from "../middleware/authMiddleware.js";
import { createConversation, getConversation, getMessages, getUnreadCounts, markRead, sendMessage } from "../controllers/messagingController.js";

const router = Router();
const participant = [protect, authorizeRoles("customer", "vendor")];
const path = "/bookings/:bookingId";
router.get(`${path}/conversation`, ...participant, getConversation);
router.post(`${path}/conversation`, ...participant, requireVerifiedEmail, createConversation);
router.get(`${path}/messages`, ...participant, getMessages);
router.post(`${path}/messages`, ...participant, requireVerifiedEmail, sendMessage);
// Reading history remains available to unverified legacy accounts; receipt
// mutation can only advance the authenticated participant's own cursor.
router.patch(`${path}/conversation/read`, ...participant, markRead);
router.get("/conversations/unread", ...participant, getUnreadCounts);
export default router;
