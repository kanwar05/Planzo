import asyncHandler from "../utils/asyncHandler.js";
import * as support from "../services/supportCaseService.js";

export const createSupportCase = asyncHandler(async (req, res) => {
  const result = await support.createSupportCase(req.params.bookingId, req.user, req.body, req.get("Idempotency-Key"));
  res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
});
export const listBookingSupportCases = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.listBookingSupportCases(req.params.bookingId, req.user) }));
export const getSupportCase = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.getSupportCase(req.params.caseId, req.user) }));
export const getSupportCaseEvents = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.getSupportCaseEvents(req.params.caseId, req.user, req.query) }));
export const addSupportCaseUpdate = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.addSupportCaseUpdate(req.params.caseId, req.user, req.body) }));
export const addPrivateNote = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.addSupportCaseUpdate(req.params.caseId, req.user, req.body, { privateNote: true }) }));
export const listAdminSupportCases = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.listAdminSupportCases(req.user, req.query) }));
export const manageSupportCase = asyncHandler(async (req, res) => res.json({ success: true,
  ...await support.manageSupportCase(req.params.caseId, req.user, req.body) }));
