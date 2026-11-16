import { hasVerifiedEmail } from "../utils/emailVerification.js";
import { isActiveAccount } from "../utils/accountEligibility.js";

const id = value => {
  const candidate = typeof value === "string" ? value
    : value?._bsontype === "ObjectId" && typeof value.toHexString === "function" ? value.toHexString() : null;
  return typeof candidate === "string" && /^[a-f0-9]{24}$/i.test(candidate) ? candidate.toLowerCase() : null;
};
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const date = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
const name = (value, maximum, fallback) => typeof value === "string" ? value.trim().slice(0, maximum) || fallback : fallback;
export function messageView(record) {
  const source = typeof record?.toObject === "function" ? record.toObject() : record;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const result = {};
  for (const field of ["_id", "conversationId", "bookingId"])
    if (id(source[field])) result[field] = id(source[field]);
  if (Number.isSafeInteger(source.sequence) && source.sequence > 0) result.sequence = source.sequence;
  if (["customer", "vendor"].includes(source.senderRole)) result.senderRole = source.senderRole;
  if (typeof source.clientMessageId === "string" && /^[A-Za-z0-9._:-]{16,128}$/.test(source.clientMessageId))
    result.clientMessageId = source.clientMessageId;
  if (typeof source.body === "string" && source.body.length <= 4000 && Buffer.byteLength(source.body, "utf8") <= 16000)
    result.body = source.body;
  if (date(source.createdAt)) result.createdAt = source.createdAt;
  return result;
}

export function conversationView(record, access) {
  const own = access.selfRole, other = own === "customer" ? "vendor" : "customer";
  const source = record || {};
  const self = own === "customer" ? access.customer : access.vendorOwner;
  const peer = own === "customer" ? access.vendorOwner : access.customer;
  return {
    _id: record ? id(record._id) : null, bookingId: id(access.booking._id),
    lastSequence: counter(source.lastSequence),
    selfReadSequence: counter(source[`${own}ReadSequence`]),
    peerReadSequence: counter(source[`${other}ReadSequence`]),
    unreadCount: counter(source[`${own}UnreadCount`]),
    readAt: date(source[`${own}ReadAt`]), peerReadAt: date(source[`${other}ReadAt`]),
    selfRole: own,
    canSend: ["pending", "accepted"].includes(access.booking.status) && hasVerifiedEmail(self) && isActiveAccount(self) && isActiveAccount(peer),
    peer: { role: other, name: other === "vendor" ? name(access.vendor.businessName, 120, "Vendor") : name(peer?.name, 80, "Customer") },
  };
}
