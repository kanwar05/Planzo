import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import {
  assertVendorAvailable,
  normalizeDateOnly,
} from "../utils/availability.js";
import asyncHandler from "../utils/asyncHandler.js";
import { requireFields, validateObjectId } from "../utils/validation.js";
import { withBookingTransaction, withVendorBookingTransaction, lockAccountForBooking, lockVendorForBooking } from "../utils/vendorBookingTransaction.js";
import { enqueueBookingEmails } from "../services/bookingNotificationService.js";
import { hasActiveVendorOwner } from "../services/vendorSearchService.js";
import { bookingView, populateBooking } from "../services/bookingViewService.js";
import { assertBookingCompletionDay, storedBookingDay, utcToday } from "../utils/bookingDates.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { getSelectablePackage, packageSnapshot } from "../services/packageService.js";
import { currentCancellationPolicy } from "../services/cancellationPolicyService.js";
import { effectivePolicyForBooking, cancellationEligibility } from "../services/cancellationPolicyViewService.js";

const identity = (value) => String(value?._id || value || "");

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

const digest = (value) => createHash("sha256").update(value).digest("hex");
function requestIdentity(req, bookingData) {
  const key = req.headers["idempotency-key"];
  if (key === undefined) return null;
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(key))
    throw new ApiError(400, "Idempotency-Key must contain 16 to 128 letters, numbers, dots, colons, underscores or hyphens.");
  const payload = [
    String(bookingData.vendorId), bookingData.eventType, bookingData.eventDateOnly,
    bookingData.eventLocation, bookingData.description, bookingData.notes,
  ];
  // Preserve historical hashes for unchanged custom requests created before
  // packages existed; package selection adds identity only when supplied.
  if (bookingData.packageId) payload.push(bookingData.packageId);
  return {
    idempotencyKeyHash: digest(key),
    requestHash: digest(JSON.stringify(payload)),
  };
}

async function replayBooking(customerId, identity, session) {
  if (!identity) return null;
  const booking = await Booking.findOne({ customerId, idempotencyKeyHash: identity.idempotencyKeyHash })
    .select("+requestHash").session(session || null);
  if (booking && booking.requestHash !== identity.requestHash)
    throw new ApiError(409, "This Idempotency-Key was already used for a different booking request.");
  return booking;
}

export const createBooking = asyncHandler(async (req, res) => {
  requireFields(req.body, [
    "vendorId",
    "eventType",
    "eventDate",
    "eventLocation",
    "description",
  ]);
  validateObjectId(req.body.vendorId, "vendor id");
  const eventDateOnly = normalizeDateOnly(req.body.eventDate, "event date");
  let packageId;
  if (req.body.packageId !== undefined) {
    if (typeof req.body.packageId !== "string" || !/^[a-f0-9]{24}$/i.test(req.body.packageId))
      throw new ApiError(400, "Provide a valid package id.");
    packageId = req.body.packageId.toLowerCase();
  }
  const bookingData = {
    _id: new mongoose.Types.ObjectId(),
    customerId: req.user._id,
    vendorId: new mongoose.Types.ObjectId(req.body.vendorId),
    eventType: text(req.body, "eventType", 120),
    eventDate: new Date(`${eventDateOnly}T00:00:00.000Z`),
    eventDateOnly,
    eventLocation: text(req.body, "eventLocation", 300),
    description: text(req.body, "description", 2000),
    notes: text(req.body, "notes", 1000, true),
  };
  const requestIdentityData = requestIdentity(req, { ...bookingData, packageId });
  if (requestIdentityData) Object.assign(bookingData, requestIdentityData);
  const eventId = randomUUID();
  let result;
  try {
    result = await withBookingTransaction(async (session) => {
      const currentCustomer = await lockAccountForBooking(req.user._id, session);
      assertVerifiedEmail(currentCustomer);
      // Replay precedes current availability/date checks: the original request
      // remains the same operation after acceptance, cancellation or midnight.
      const existing = await replayBooking(req.user._id, requestIdentityData, session);
      if (existing) return { booking: existing, replayed: true };
      if (eventDateOnly < utcToday())
        throw new ApiError(400, "Event date cannot be in the past.");
      const currentVendor = await lockVendorForBooking(bookingData.vendorId, session);
      if (!(await hasActiveVendorOwner(currentVendor, session))) throw new ApiError(404, "Approved vendor not found.");
      if (identity(currentVendor.userId) === identity(req.user))
        throw new ApiError(400, "You cannot book your own vendor profile.");
      await assertVendorAvailable({ vendorId: currentVendor._id, dateOnly: eventDateOnly, session });
      const selectedPackage = packageId
        ? packageSnapshot(await getSelectablePackage(packageId, currentVendor, { session })) : undefined;
      const [created] = await Booking.create([{ ...bookingData,
        requestCancellationPolicy: await currentCancellationPolicy(session), ...(selectedPackage ? { selectedPackage } : {}) }], { session });
      await enqueueBookingEmails({
        booking: created, eventType: "booking_requested", eventId, session,
      });
      return { booking: created, replayed: false };
    });
  } catch (error) {
    // The partial unique index is the final arbiter, including callers on
    // separate API instances. Read only after the failed transaction aborts.
    if (requestIdentityData && error.code === 11000 &&
        (error.keyPattern?.idempotencyKeyHash || error.message?.includes("one_booking_per_customer_idempotency_key"))) {
      const existing = await replayBooking(req.user._id, requestIdentityData);
      if (existing) result = { booking: existing, replayed: true };
      else throw error;
    } else throw error;
  }
  const populated = await populateBooking(Booking.findById(result.booking._id));
  res
    .status(result.replayed ? 200 : 201)
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
  if (isVendor && !["accepted", "rejected", "completed", "cancelled"].includes(status))
    throw new ApiError(
      403,
      "Vendors can only accept, reject, cancel, or complete bookings.",
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
  if (status === "accepted" && (booking.selectedPackage || booking.quotationRevision > 0 || booking.acceptedAgreement))
    throw new ApiError(409, "The customer must accept a final quotation for this booking.");
  if (req.body.overridePolicy !== undefined && (status !== "cancelled" || typeof req.body.overridePolicy !== "boolean"))
    throw new ApiError(400, "overridePolicy is a boolean supported only for cancellation.");
  if (req.body.overridePolicy === true && !isAdmin)
    throw new ApiError(403, "Only an administrator can explicitly override a cancellation cutoff.");
  if (status === "cancelled" && Object.keys(req.body).some(key => !["status", "reason", "overridePolicy"].includes(key)))
    throw new ApiError(400, "Cancellation records are generated by the server; provide status, reason and an optional administrator override only.");

  const changes = { status };
  if (["accepted", "completed"].includes(status)) {
    const dateOnly = storedBookingDay(booking);
    if (status === "completed") assertBookingCompletionDay(dateOnly);
    changes.eventDateOnly = dateOnly;
    changes.eventDate = new Date(`${dateOnly}T00:00:00.000Z`);
  }
  if (["rejected", "cancelled"].includes(status)) {
    const reason = text(req.body, "reason", 1000, true)
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
      .trim();
    changes[status === "rejected" ? "rejectionReason" : "cancellationReason"] =
      reason;
    if (status === "cancelled" && (isVendor || req.body.overridePolicy === true) && !reason)
      throw new ApiError(400, "Vendor cancellation and administrator overrides require a reason.");
  }
  // Generate once per operation, outside the callback that the driver may retry.
  const eventId = randomUUID();
  const cancellationId = new mongoose.Types.ObjectId();
  let updated;
  try {
    const persist = async (session, currentVendor = vendor) => {
      let cancellationCutoffAt = null;
      if (status === "cancelled") {
        const actor = await lockAccountForBooking(req.user._id, session);
        if (actor.role !== req.user.role || (actor.authVersion || 0) !== (req.user.authVersion || 0))
          throw new ApiError(401, "Your account changed. Please sign in again.");
        if (isVendor) assertVerifiedEmail(actor);
        const current = await Booking.findById(booking._id).session(session);
        if (!current || current.status !== booking.status || current.cancellation)
          throw new ApiError(409, "The booking changed or was already cancelled.");
        const currentOwner = await Vendor.findById(current.vendorId).select("userId").session(session);
        if (!isAdmin && !(isCustomer && identity(current.customerId) === identity(actor)) &&
            !(isVendor && identity(currentOwner?.userId) === identity(actor)))
          throw new ApiError(403, "You cannot cancel this booking.");
        const effective = effectivePolicyForBooking(current);
        const eligibility = cancellationEligibility(current, effective.policy);
        if (isCustomer && !eligibility.customerCanCancel || isVendor && !eligibility.vendorCanCancel)
          throw new ApiError(409, isCustomer ? eligibility.customerReason : eligibility.vendorReason);
        if (isAdmin && eligibility.adminOverrideRequired && req.body.overridePolicy !== true)
          throw new ApiError(409, "The cancellation cutoff has passed. An explicit administrator override and reason are required.");
        cancellationCutoffAt = isCustomer ? eligibility.customerCutoffAt : isVendor ? eligibility.vendorCutoffAt
          : req.body.overridePolicy === true ? null : [eligibility.customerCutoffAt, eligibility.vendorCutoffAt].filter(Boolean).sort((a, b) => a - b)[0] || null;
        changes.cancellation = { cancellationId, cancelledById: actor._id, cancelledByRole: actor.role,
          cancelledAt: new Date(), reason: changes.cancellationReason, previousStatus: current.status,
          policySnapshot: effective.policy, policySource: effective.source, overridePolicy: req.body.overridePolicy === true };
      }
      if (status === "accepted") {
        const current = await Booking.findById(booking._id).session(session);
        if (current?.selectedPackage || current?.quotationRevision > 0 || current?.acceptedAgreement)
          throw new ApiError(409, "The customer must accept a final quotation for this booking.");
      }
      if (status === "completed") assertBookingCompletionDay(changes.eventDateOnly);
      if (status === "accepted") {
        if (!(await hasActiveVendorOwner(currentVendor, session)))
          throw new ApiError(
            409,
            "Vendor must be approved and active to accept bookings.",
          );
        if (changes.eventDateOnly < utcToday())
          throw new ApiError(409, "Past booking requests cannot be accepted.");
        await assertVendorAvailable({
          vendorId: currentVendor._id,
          dateOnly: changes.eventDateOnly,
          excludeBookingId: booking._id,
          session,
        });
      }
      const result = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          status: booking.status,
          customerId: booking.customerId,
          vendorId: booking.vendorId,
          ...(status === "cancelled" ? { cancellation: null } : {}),
          ...(cancellationCutoffAt ? { $expr: { $lt: ["$$NOW", { $literal: cancellationCutoffAt }] } } : {}),
        },
        { $set: changes },
        { new: true, runValidators: true, session },
      );
      if (!result)
        throw new ApiError(
          409,
          "Booking changed while this request was being processed. Refresh and try again.",
        );
      await enqueueBookingEmails({
        booking: result, eventType: `booking_${status}`, eventId, session,
      });
      return result;
    };
    updated = status === "accepted"
      ? await withVendorBookingTransaction(
        booking.vendorId, persist, isVendor ? req.user._id : undefined,
      )
      : await withBookingTransaction(persist);
  } catch (error) {
    if (
      error.code === 11000 &&
      ((error.keyPattern?.vendorId && error.keyPattern?.eventDateOnly) ||
        error.message.includes("one_confirmed_booking_per_vendor_date"))
    )
      throw new ApiError(409, "Vendor already has a booking on this date.");
    throw error;
  }
  const populated = await populateBooking(Booking.findById(updated._id));
  res.json({
    success: true,
    message: "Booking status updated.",
    booking: bookingView(populated, req.user),
  });
});
