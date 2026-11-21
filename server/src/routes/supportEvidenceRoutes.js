import { Router } from "express";
import { protect, authorizeRoles, requireVerifiedEmail } from "../middleware/authMiddleware.js";
import { uploadSupportEvidence } from "../middleware/upload.js";
import { evidenceUploadPreflight, addSupportEvidence, getSupportEvidence, streamSupportEvidence } from "../services/supportEvidenceService.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";

const router = Router();
const roles = authorizeRoles("customer", "vendor", "admin");
router.post("/support/cases/:caseId/evidence", protect, roles, requireVerifiedEmail,
  asyncHandler(async (req, res, next) => {
    const result = await evidenceUploadPreflight(req.params.caseId, req.user, req.get("Idempotency-Key"));
    if (result.replay) { req.resume(); return res.json({ success: true, ...result.replay }); }
    req.evidenceRequestKeyHash = result.requestKeyHash;
    next();
  }),
  (req, res, next) => uploadSupportEvidence(req, res, error => next(error?.code === "LIMIT_FILE_SIZE"
    ? new ApiError(400, "Each evidence image must be 5MB or smaller.")
    : error?.statusCode === 503 ? new ApiError(503, "Evidence uploads are currently unavailable.") : error)),
  asyncHandler(async (req, res) => {
    const result = await addSupportEvidence(req.params.caseId, req.user, req.body, req.files, req.evidenceRequestKeyHash);
    res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
  }));
router.get("/support/cases/:caseId/evidence/:evidenceId", protect, roles, asyncHandler(async (req, res) => {
  const asset = await getSupportEvidence(req.params.caseId, req.params.evidenceId, req.user);
  await streamSupportEvidence(asset, res);
}));
export default router;
