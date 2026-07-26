import AuditLog from "../models/AuditLog.js";

export function browserFromRequest(req) {
  const agent = req.get("user-agent") || "";
  if (/Edg\//.test(agent)) return "Edge";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Safari\//.test(agent)) return "Safari";
  return "Unknown browser";
}

export function auditContext(req) {
  return {
    ip: req.ip || req.socket?.remoteAddress || "Unknown",
    browser: browserFromRequest(req),
  };
}

export function recordAudit(req, details) {
  const actor = details.actor || req.user?._id || null;
  return AuditLog.create({
    ...details,
    actor,
    admin: details.admin === undefined && req.user?.role === "admin" ? req.user._id : details.admin,
    ...auditContext(req),
  });
}
