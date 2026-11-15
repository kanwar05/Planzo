import { vendorView } from "./vendorSearchService.js";

export const populateBooking = (query) =>
  query
    .populate("customerId", "name")
    .populate(
      "vendorId",
      "businessName serviceCategory pricing location description servicesOffered profileImage coverImage portfolioImages verified verificationStatus userId +contactDetails",
    );

const identity = (value) => String(value?._id || value || "");

export function bookingView(booking, viewer) {
  const source = booking.toObject ? booking.toObject() : booking;
  const keys = [
    "_id",
    "eventType",
    "eventDate",
    "eventDateOnly",
    "eventLocation",
    "description",
    "notes",
    "status",
    "rejectionReason",
    "cancellationReason",
    "createdAt",
    "updatedAt",
  ];
  const result = Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  result.description ||= "";
  result.notes ||= "";
  result.customerId = source.customerId?.name
    ? { _id: source.customerId._id, name: source.customerId.name }
    : source.customerId;
  const isCustomer =
    viewer.role === "customer" &&
    identity(source.customerId) === identity(viewer);
  const isOwner =
    viewer.role === "vendor" &&
    identity(source.vendorId?.userId) === identity(viewer);
  const shareContact =
    viewer.role === "admin" ||
    isOwner ||
    (isCustomer && ["accepted", "completed"].includes(source.status));
  result.vendorId = source.vendorId?.businessName
    ? vendorView(source.vendorId, { contact: shareContact })
    : source.vendorId;
  return result;
}
