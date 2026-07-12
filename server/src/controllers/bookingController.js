import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import {
  assertTimeRange,
  assertVendorAvailable,
  normalizeDateOnly,
} from "../utils/availability.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  requireFields,
  toNonNegativeNumber,
  validateObjectId,
} from "../utils/validation.js";
import { safeCreateNotification } from "./notificationController.js";
import {
  ONE_DAY_MS,
  getNotificationTimings,
  sendBookingCreatedNotification,
  sendBookingStatusNotification,
} from "../services/transactionalNotificationService.js";
import { initializeBookingPayments } from "../services/payments/paymentCalculationService.js";

const populateBooking = (query) =>
  query
    .populate("customerId", "name email phone")
    .populate({
      path: "vendorId",
      select:
        "businessName serviceCategory pricing location profileImage coverImage portfolioImages averageRating reviewCount rating reviewsCount verified userId",
      populate: {
        path: "userId",
        select: "name email phone notificationPreferences",
      },
    });

const populateBookingDocument = (booking) =>
  booking.populate([
    { path: "customerId", select: "name email phone" },
    {
      path: "vendorId",
      select:
        "businessName serviceCategory pricing location profileImage coverImage portfolioImages averageRating reviewCount rating reviewsCount verified userId",
      populate: {
        path: "userId",
        select: "name email phone notificationPreferences",
      },
    },
  ]);

export const createBooking = asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "vendorId",
    "eventType",
    "eventDate",
    "eventStartTime",
    "eventEndTime",
    "eventLocation",
    "budget",
  ]);
  validateObjectId(req.body.vendorId, "vendor id");

  const vendor = await Vendor.findById(req.body.vendorId).populate(
    "userId",
    "name email phone notificationPreferences",
  );
  if (!vendor) throw new ApiError(404, "Vendor not found.");

  if (String(vendor.userId?._id || vendor.userId) === String(req.user._id)) {
    throw new ApiError(400, "You cannot book your own vendor profile.");
  }

  const eventDateOnly = normalizeDateOnly(req.body.eventDate, "event date");
  const eventDate = new Date(`${eventDateOnly}T00:00:00.000Z`);
  if (Number.isNaN(eventDate.getTime())) {
    throw new ApiError(400, "Please provide a valid event date.");
  }
  if (eventDate < new Date(new Date().toISOString().slice(0, 10))) {
    throw new ApiError(400, "Event date cannot be in the past.");
  }
  const { startTime, endTime } = assertTimeRange(
    String(req.body.eventStartTime),
    String(req.body.eventEndTime),
  );

  await assertVendorAvailable({
    vendorId: vendor._id,
    dateOnly: eventDateOnly,
    startTime,
    endTime,
  });

  const { bookingReminderLeadMs } = getNotificationTimings();

  const booking = await Booking.create({
    customerId: req.user._id,
    vendorId: vendor._id,
    eventType: req.body.eventType,
    eventDate,
    eventDateOnly,
    eventStartTime: startTime,
    eventEndTime: endTime,
    timezone: req.body.timezone || "Asia/Kolkata",
    eventLocation: req.body.eventLocation,
    budget: toNonNegativeNumber(req.body.budget, "Budget"),
    specialRequirements: req.body.specialRequirements || "",
    bookingReminderDueAt: new Date(eventDate.getTime() - bookingReminderLeadMs),
    bookingReminderSentAt: null,
    reviewReminderDueAt: null,
    reviewReminderSentAt: null,
  });
  initializeBookingPayments(booking);
  await booking.save();

  // Notify vendor of new booking request
  await safeCreateNotification(
    vendor.userId._id,
    "booking_created",
    "New Booking Request",
    `You received a new booking request for ${req.body.eventType}.`,
    { bookingId: booking._id, vendorId: vendor._id },
  );

  await sendBookingCreatedNotification({
    customer: req.user,
    vendorUser: vendor.userId,
    vendorName: vendor.businessName,
    booking,
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
  const rejectionReason =
    status === "rejected" && typeof req.body.reason === "string"
      ? req.body.reason.trim()
      : "";
  if (!BOOKING_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `Status must be one of: ${BOOKING_STATUSES.join(", ")}.`,
    );
  }

  const booking = await Booking.findById(req.params.id).populate(
    "customerId",
    "name email phone notificationPreferences",
  );
  if (!booking) throw new ApiError(404, "Booking not found.");

  const isCustomer = String(booking.customerId) === String(req.user._id);
  const vendor = await Vendor.findById(booking.vendorId).populate(
    "userId",
    "name email phone notificationPreferences",
  );
  const isVendor = vendor && String(vendor.userId?._id || vendor.userId) === String(req.user._id);
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

  const oldStatus = booking.status;
  booking.status = status;

  if (status === "completed") {
    booking.reviewReminderDueAt = new Date(Date.now() + 3 * ONE_DAY_MS);
    booking.reviewReminderSentAt = null;
  }
  await booking.save();
  await populateBookingDocument(booking);

  const vendorOwnerId = vendor?.userId?._id || vendor?.userId;

  // Notify customer when vendor accepts, rejects, or completes booking
  if (isVendor || isAdmin) {
    let notificationType = "booking_update";
    let title = "Booking Update";
    let message = "";

    if (status === "accepted") {
      notificationType = "booking_accepted";
      title = "Booking Accepted";
      message = `Your booking request for ${booking.eventType} has been accepted by ${vendor?.businessName || "the vendor"} on ${booking.eventDateOnly || booking.eventDate}. Booking ID: ${booking._id}.`;
    } else if (status === "rejected") {
      notificationType = "booking_rejected";
      title = "Booking Rejected";
      message = `Your booking request for ${booking.eventType} was rejected by ${vendor?.businessName || "the vendor"}. Booking ID: ${booking._id}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`;
    } else if (status === "completed") {
      notificationType = "booking_completed";
      title = "Booking Completed";
      message = `Your booking has been completed. Please leave a review!`;
    } else if (status === "cancelled") {
      title = "Booking Cancelled";
      message = `Your booking has been cancelled.`;
    }

    if (message) {
      await safeCreateNotification(
        booking.customerId,
        notificationType,
        title,
        message,
        { bookingId: booking._id, vendorId: booking.vendorId },
      );

      await sendBookingStatusNotification({
        customer: booking.customerId,
        vendorName: vendor?.businessName || "your vendor",
        booking,
        status,
        reason: rejectionReason,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: "Booking status updated successfully.",
    booking,
  });
});
