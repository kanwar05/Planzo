import { vendorView } from "./vendorSearchService.js";
import { packageSnapshot } from "./packageViewService.js";
import { acceptedAgreementView } from "./quotationViewService.js";

export const populateBooking = (query) =>
  query
    .populate("customerId", "name")
    .populate(
      "vendorId",
      "businessName serviceCategory pricing location description servicesOffered profileImage coverImage portfolioImages verified verificationStatus userId +contactDetails",
    );

function referenceId(value) {
  const identifier = typeof value === "string"
    ? value
    : value?._bsontype === "ObjectId" && typeof value.toHexString === "function"
      ? value.toHexString()
      : "";
  return /^[a-f0-9]{24}$/i.test(identifier) ? identifier.toLowerCase() : null;
}

const identity = (value) => referenceId(value) || referenceId(value?._id);
const record = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && value._bsontype !== "ObjectId";

function customerView(customer) {
  if (!record(customer)) return identity(customer);
  const result = {};
  const id = identity(customer);
  if (id) result._id = id;
  if (typeof customer.name === "string") result.name = customer.name;
  return result;
}

export function bookingView(booking, viewer) {
  const source = typeof booking?.toObject === "function" ? booking.toObject() : booking || {};
  const result = {};
  const id = identity(source);
  if (id) result._id = id;
  for (const key of ["eventType", "eventDateOnly", "eventLocation", "description", "notes", "status"])
    if (typeof source[key] === "string") result[key] = source[key];
  for (const key of ["eventDate", "createdAt", "updatedAt"])
    if (source[key] instanceof Date && Number.isFinite(source[key].getTime())) result[key] = source[key];
  result.description ||= "";
  result.notes ||= "";
  result.customerId = customerView(source.customerId);
  const viewerId = identity(viewer);
  const isCustomer =
    viewer?.role === "customer" && viewerId &&
    identity(source.customerId) === viewerId;
  const isOwner =
    viewer?.role === "vendor" && viewerId &&
    identity(source.vendorId?.userId) === viewerId;
  const isParticipant = viewer?.role === "admin" || isOwner || isCustomer;
  if (isParticipant) {
    for (const key of ["rejectionReason", "cancellationReason"])
      if (typeof source[key] === "string") result[key] = source[key];
    if (source.selectedPackage) result.selectedPackage = packageSnapshot(source.selectedPackage);
    if (Number.isSafeInteger(source.quotationRevision) && source.quotationRevision >= 0)
      result.quotationRevision = source.quotationRevision;
    if (["none", "offered", "rejected", "accepted"].includes(source.quotationStatus))
      result.quotationStatus = source.quotationStatus;
    if (source.acceptedAgreement) result.acceptedAgreement = acceptedAgreementView(source.acceptedAgreement);
  }
  const shareContact =
    viewer?.role === "admin" ||
    isOwner ||
    (isCustomer && ["accepted", "completed"].includes(source.status));
  // A populated record must always pass the allowlist, even when legacy data
  // has no businessName. Never fall back to returning a provider/user object.
  result.vendorId = record(source.vendorId)
    ? vendorView(source.vendorId, { contact: shareContact })
    : identity(source.vendorId);
  return result;
}
