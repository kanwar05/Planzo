import mongoose from "mongoose";
import AuditLog, { AUDIT_ACTIONS } from "../models/AuditLog.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const buildFilter = (query) => {
  const filter = {};
  if (query.action) {
    if (!AUDIT_ACTIONS.includes(query.action)) throw new ApiError(400, "Invalid audit action.");
    filter.action = query.action;
  }
  if (query.admin) {
    if (!mongoose.isValidObjectId(query.admin)) throw new ApiError(400, "Invalid admin id.");
    filter.admin = query.admin;
  }
  if (query.targetType) filter.targetType = String(query.targetType);
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }
  if (query.search) {
    const escaped = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { targetLabel: { $regex: escaped, $options: "i" } },
      { reason: { $regex: escaped, $options: "i" } },
      { ip: { $regex: escaped, $options: "i" } },
      { browser: { $regex: escaped, $options: "i" } },
    ];
  }
  return filter;
};

export const listAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 500);
  const filter = buildFilter(req.query);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("admin", "name email")
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
