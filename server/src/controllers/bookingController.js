import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import {
  assertVendorAvailable,
  normalizeDateOnly,
} from "../utils/availability.js";
import asyncHandler from "../utils/asyncHandler.js";
import { requireFields, validateObjectId } from "../utils/validation.js";
import {
  hasActiveVendorOwner,
  vendorView,
} from "../services/vendorSearchService.js";

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

const text = (body, key, limit, optional = false) => {
  const value = body[key];
  if (optional && value === undefined) return "";
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.trim().length > limit
  ) {
    throw new ApiError(
      400,
      `${key} must be ${optional ? "text" : "non-empty text"} up to ${limit} characters.`,
    );
  }
  return value.trim();
};

export const createBooking = asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "vendorId",
    "eventType",
    "eventDate",
    "eventLocation",
    "description",
  ]);
  validateObjectId(req.body.vendorId, "vendor id");
  const vendor = await Vendor.findById(req.body.vendorId);
  if (!(await hasActiveVendorOwner(vendor)))
    throw new ApiError(404, "Approved vendor not found.");
  if (identity(vendor.userId) === identity(req.user))
    throw new ApiError(400, "You cannot book your own vendor profile.");

  const eventDateOnly = normalizeDateOnly(req.body.eventDate, "event date");
  if (eventDateOnly < new Date().toISOString().slice(0, 10))
    throw new ApiError(400, "Event date cannot be in the past.");
  await assertVendorAvailable({
    vendorId: vendor._id,
    dateOnly: eventDateOnly,
  });
  const booking = await Booking.create({
    customerId: req.user._id,
    vendorId: vendor._id,
    eventType: text(req.body, "eventType", 120),
    eventDate: new Date(`${eventDateOnly}T00:00:00.000Z`),
    eventDateOnly,
    eventLocation: text(req.body, "eventLocation", 300),
    description: text(req.body, "description", 2000),
    notes: text(req.body, "notes", 1000, true),
  });
  const populated = await populateBooking(Booking.findById(booking._id));
  res
    .status(201)
    .json({
      success: true,
      message: "Booking request sent.",
      booking: bookingView(populated, req.user),
    });
});

export const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await populateBooking(
    Booking.find({ customerId: req.user._id }).sort({ createdAt: -1 }),
  );
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    count: bookings.length,
    bookings: bookings.map((booking) => bookingView(booking, req.user)),
  });
});

export const getVendorRequests = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (!vendor)
    throw new ApiError(404, "Create a vendor profile before viewing requests.");
  const bookings = await populateBooking(
    Booking.find({ vendorId: vendor._id }).sort({ createdAt: -1 }),
  );
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    count: bookings.length,
    bookings: bookings.map((booking) => bookingView(booking, req.user)),
  });
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  const bookingId = req.params.id || req.params.bookingId;
  validateObjectId(bookingId, "booking id");
  if (
    typeof req.body.status !== "string" ||
    !BOOKING_STATUSES.includes(req.body.status)
  )
    throw new ApiError(400, "Provide a valid booking status.");
  const status = req.body.status;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const vendor = await Vendor.findById(booking.vendorId);
  const isAdmin = req.user.role === "admin";
  const isCustomer =
    req.user.role === "customer" &&
    identity(booking.customerId) === identity(req.user);
  const isVendor =
    req.user.role === "vendor" &&
    identity(vendor?.userId) === identity(req.user);
  if (!isAdmin && !isCustomer && !isVendor)
    throw new ApiError(403, "You cannot update this booking.");
  if (isCustomer && status !== "cancelled")
    throw new ApiError(403, "Customers can only cancel their bookings.");
  if (isVendor && !["accepted", "rejected", "completed"].includes(status))
    throw new ApiError(
      403,
      "Vendors can only accept, reject, or complete bookings.",
    );
  const transitions = {
    pending: ["accepted", "rejected", "cancelled"],
    accepted: ["completed", "cancelled"],
    rejected: [],
    completed: [],
    cancelled: [],
  };
  if (!transitions[booking.status]?.includes(status))
    throw new ApiError(
      409,
      `Booking cannot move from ${booking.status} to ${status}.`,
    );

  const changes = { status };
  if (status === "accepted") {
    if (!(await hasActiveVendorOwner(vendor)))
      throw new ApiError(
        409,
        "Vendor must be approved and active to accept bookings.",
      );
    const dateOnly =
      booking.eventDateOnly || booking.eventDate.toISOString().slice(0, 10);
    if (dateOnly < new Date().toISOString().slice(0, 10))
      throw new ApiError(409, "Past booking requests cannot be accepted.");
    await assertVendorAvailable({
      vendorId: vendor._id,
      dateOnly,
      excludeBookingId: booking._id,
    });
    changes.eventDateOnly = dateOnly;
    changes.eventDate = new Date(`${dateOnly}T00:00:00.000Z`);
  }
  if (["rejected", "cancelled"].includes(status)) {
    const reason = text(req.body, "reason", 1000, true);
    changes[status === "rejected" ? "rejectionReason" : "cancellationReason"] =
      reason;
  }
  let updated;
  try {
    updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: booking.status },
      { $set: changes },
      { new: true, runValidators: true },
    );
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(409, "Vendor already has a booking on this date.");
    throw error;
  }
  if (!updated)
    throw new ApiError(
      409,
      "Booking changed while this request was being processed. Refresh and try again.",
    );
  const populated = await populateBooking(Booking.findById(updated._id));
  res.json({
    success: true,
    message: "Booking status updated.",
    booking: bookingView(populated, req.user),
  });
});
