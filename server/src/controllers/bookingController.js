import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  requireFields,
  toNonNegativeNumber,
  validateObjectId,
} from "../utils/validation.js";

const populateBooking = (query) =>
  query
    .populate("customerId", "name email phone")
    .populate(
      "vendorId",
      "businessName serviceCategory pricing location profileImage coverImage portfolioImages averageRating reviewCount rating reviewsCount verified userId",
    );

const populateBookingDocument = (booking) =>
  booking.populate([
    { path: "customerId", select: "name email phone" },
    {
      path: "vendorId",
      select:
        "businessName serviceCategory pricing location profileImage coverImage portfolioImages averageRating reviewCount rating reviewsCount verified userId",
    },
  ]);

export const createBooking = asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "vendorId",
    "eventType",
    "eventDate",
    "eventLocation",
    "budget",
  ]);
  validateObjectId(req.body.vendorId, "vendor id");

  const vendor = await Vendor.findById(req.body.vendorId);
  if (!vendor) throw new ApiError(404, "Vendor not found.");

  if (String(vendor.userId) === String(req.user._id)) {
    throw new ApiError(400, "You cannot book your own vendor profile.");
  }

  const eventDate = new Date(req.body.eventDate);
  if (Number.isNaN(eventDate.getTime())) {
    throw new ApiError(400, "Please provide a valid event date.");
  }
  if (eventDate < new Date()) {
    throw new ApiError(400, "Event date cannot be in the past.");
  }

  const booking = await Booking.create({
    customerId: req.user._id,
    vendorId: vendor._id,
    eventType: req.body.eventType,
    eventDate,
    eventLocation: req.body.eventLocation,
    budget: toNonNegativeNumber(req.body.budget, "Budget"),
    specialRequirements: req.body.specialRequirements || "",
  });

  await populateBookingDocument(booking);

  res.status(201).json({
    success: true,
    message: "Booking request created successfully.",
    booking,
  });
});

export const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await populateBooking(
    Booking.find({ customerId: req.user._id }).sort({ createdAt: -1 }),
  );

  res.status(200).json({
    success: true,
    count: bookings.length,
    bookings,
  });
});

export const getVendorRequests = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id });
  if (!vendor) {
    throw new ApiError(404, "Create a vendor profile before viewing requests.");
  }

  const bookings = await populateBooking(
    Booking.find({ vendorId: vendor._id }).sort({ createdAt: -1 }),
  );

  res.status(200).json({
    success: true,
    count: bookings.length,
    bookings,
  });
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "booking id");
  requireFields(req.body, ["status"]);

  const status = String(req.body.status).toLowerCase();
  if (!BOOKING_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `Status must be one of: ${BOOKING_STATUSES.join(", ")}.`,
    );
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");

  const isCustomer = String(booking.customerId) === String(req.user._id);
  const vendor = await Vendor.findById(booking.vendorId).select("userId");
  const isVendor = vendor && String(vendor.userId) === String(req.user._id);
  const isAdmin = req.user.role === "admin";

  if (!isCustomer && !isVendor && !isAdmin) {
    throw new ApiError(403, "You cannot update this booking.");
  }

  if (isCustomer && !isAdmin && status !== "cancelled") {
    throw new ApiError(403, "Customers can only cancel their bookings.");
  }

  if (
    isVendor &&
    !isAdmin &&
    !["accepted", "rejected", "completed"].includes(status)
  ) {
    throw new ApiError(
      403,
      "Vendors can only accept, reject, or complete bookings.",
    );
  }

  const allowedTransitions = {
    pending: ["accepted", "rejected", "cancelled"],
    accepted: ["completed", "cancelled"],
    rejected: [],
    completed: [],
    cancelled: [],
  };

  if (!isAdmin && !allowedTransitions[booking.status].includes(status)) {
    throw new ApiError(
      409,
      `Booking cannot move from ${booking.status} to ${status}.`,
    );
  }

  booking.status = status;
  await booking.save();
  await populateBookingDocument(booking);

  res.status(200).json({
    success: true,
    message: "Booking status updated successfully.",
    booking,
  });
});
