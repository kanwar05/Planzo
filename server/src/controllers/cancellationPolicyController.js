import asyncHandler from "../utils/asyncHandler.js";
import { bookingCancellationPolicy, cancellationPolicyHistory, currentCancellationPolicy, publishCancellationPolicy } from "../services/cancellationPolicyService.js";
export const getCurrentPolicy = asyncHandler(async (_req, res) => res.set("Cache-Control", "no-store").json({ success: true, policy: await currentCancellationPolicy() }));
export const getPolicyHistory = asyncHandler(async (req, res) => res.set("Cache-Control", "no-store").json({ success: true, ...await cancellationPolicyHistory(req.query) }));
export const publishPolicy = asyncHandler(async (req, res) => res.status(201).json({ success: true, policy: await publishCancellationPolicy(req.user, req.body) }));
export const getBookingPolicy = asyncHandler(async (req, res) => res.json({ success: true, ...await bookingCancellationPolicy(req.params.bookingId, req.user) }));
