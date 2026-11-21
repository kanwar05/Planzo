import { SUPPORT_CASE_CATEGORIES, SUPPORT_CASE_STATUSES } from "../models/SupportCase.js";
import { SUPPORT_CASE_EVENT_KINDS } from "../models/SupportCaseEvent.js";
import { acceptedAgreementView } from "./quotationViewService.js";

const record = value => value && typeof value === "object" && !Array.isArray(value);
const plain = value => typeof value?.toObject === "function" ? value.toObject() : value;
const id = value => {
  const candidate = typeof value === "string" ? value : value?._bsontype === "ObjectId" && typeof value.toHexString === "function" ? value.toHexString() : null;
  return typeof candidate === "string" && /^[a-f0-9]{24}$/i.test(candidate) ? candidate.toLowerCase() : null;
};
const validDate = value => value instanceof Date && Number.isFinite(value.getTime());
export function supportCaseView(input, viewer) {
  const source = plain(input);
  if (!record(source)) return null;
  const result = {};
  for (const field of ["_id", "bookingId"]) if (id(source[field])) result[field] = id(source[field]);
  for (const [field, maximum] of [["subject", 160], ["description", 4000], ["resolution", 4000]])
    if (typeof source[field] === "string") result[field] = source[field].slice(0, maximum);
  if (SUPPORT_CASE_CATEGORIES.includes(source.category)) result.category = source.category;
  if (SUPPORT_CASE_STATUSES.includes(source.status)) result.status = source.status;
  if (["pending", "accepted", "rejected", "cancelled", "completed"].includes(source.bookingStatusAtOpen)) result.bookingStatusAtOpen = source.bookingStatusAtOpen;
  if (["customer", "vendor"].includes(source.openedByRole)) result.openedByRole = source.openedByRole;
  if (Number.isSafeInteger(source.revision) && source.revision >= 1) result.revision = source.revision;
  result.assigned = Boolean(id(source.assignedAdminId));
  if (viewer?.role === "admin") result.assignedAdminId = id(source.assignedAdminId);
  for (const field of ["createdAt", "updatedAt", "resolvedAt", "closedAt"])
    if (validDate(source[field])) result[field] = source[field];
  if (source.agreementSnapshot) result.agreementSnapshot = acceptedAgreementView(source.agreementSnapshot);
  result.evidence = (Array.isArray(source.evidence) ? source.evidence : []).slice(0, 20).flatMap(item => {
    if (!record(item) || !id(item.evidenceId) || !["jpg", "png", "webp"].includes(item.format) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > 5 * 1024 * 1024 || !validDate(item.createdAt)) return [];
    return [{ evidenceId: id(item.evidenceId), format: item.format, bytes: item.bytes, createdAt: item.createdAt,
      ...(["customer", "vendor", "admin"].includes(item.uploaderRole) ? { uploaderRole: item.uploaderRole } : {}) }];
  });
  return result;
}

export function supportCaseEventView(input, viewer) {
  const source = plain(input);
  if (!record(source) || !["participants", "admin"].includes(source.visibility) || source.visibility === "admin" && viewer?.role !== "admin") return null;
  const result = {};
  if (id(source._id)) result._id = id(source._id);
  if (Number.isSafeInteger(source.sequence) && source.sequence >= 1) result.sequence = source.sequence;
  if (SUPPORT_CASE_EVENT_KINDS.includes(source.kind)) result.kind = source.kind;
  if (["customer", "vendor", "admin"].includes(source.actorRole)) result.actorRole = source.actorRole;
  if (typeof source.body === "string") result.body = source.body.slice(0, 4000);
  if (validDate(source.createdAt)) result.createdAt = source.createdAt;
  for (const field of ["previousStatus", "status"]) if (SUPPORT_CASE_STATUSES.includes(source[field])) result[field] = source[field];
  result.evidenceIds = (Array.isArray(source.evidenceIds) ? source.evidenceIds : []).slice(0, 20).map(id).filter(Boolean);
  if (viewer?.role === "admin") {
    result.visibility = source.visibility;
    if (source.assignedAdminId === null || id(source.assignedAdminId)) result.assignedAdminId = id(source.assignedAdminId);
  }
  return result;
}
