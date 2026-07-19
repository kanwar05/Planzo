import Booking from "../models/Booking.js";
import CancellationRequest from "../models/CancellationRequest.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";
import { calculateCancellation } from "../services/payments/cancellationPolicyService.js";
import { initiateBookingRefund } from "../services/payments/refundService.js";
import { safeSyncBookingToGoogle } from "../services/googleCalendarService.js";

const bookingAccess = async (booking, user) => {
  const vendor = await Vendor.findById(booking.vendorId);
  const isCustomer = String(booking.customerId) === String(user._id);
  const isVendor = user.role === "vendor" && String(vendor?.userId) === String(user._id);
  const isAdmin = user.role === "admin";
  return { vendor, isCustomer, isVendor, isAdmin, allowed: isCustomer || isVendor || isAdmin };
};

export const cancelBooking = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "booking id");
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) throw new ApiError(400, "Cancellation reason is required.");
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const access = await bookingAccess(booking, req.user);
  if (!access.allowed) throw new ApiError(403, "You cannot cancel this booking.");
  if (!["pending", "accepted"].includes(booking.status)) throw new ApiError(409, `A ${booking.status} booking cannot be cancelled.`);
  if (await CancellationRequest.exists({ booking: booking._id })) throw new ApiError(409, "A cancellation already exists for this booking.");

  const role = access.isAdmin ? "admin" : access.isVendor ? "vendor" : "customer";
  const calculation = calculateCancellation(booking, new Date(), role);
  const refundStatus = calculation.refundAmount ? "pending_review" : "not_applicable";
  const note = calculation.policyOutcome === "no_refund" ? "Cancellation policy provides no refund." : `${calculation.refundPercentage}% refund calculated.`;
  const cancellation = await CancellationRequest.create({
    booking: booking._id, customer: booking.customerId, vendor: booking.vendorId,
    cancelledBy: req.user._id, cancelledByRole: role, cancellationReason: reason,
    ...calculation, refundStatus, refundReason: note,
    timeline: [{ action: "cancelled", status: refundStatus, note, actor: req.user._id }],
  });
  booking.status = "cancelled"; booking.cancelledBy = req.user._id; booking.cancelledByRole = role; booking.cancelledAt = cancellation.cancelledAt;
  booking.cancellationReason = reason; booking.refundAmount = calculation.refundAmount; booking.refundPercentage = calculation.refundPercentage;
  booking.refundStatus = refundStatus; booking.refundReason = note; booking.cancellationFeeAmount = calculation.lateCancellationFee;
  booking.cancellationRequest = cancellation._id; booking.payoutOnHold = true; booking.payoutStatus = "on_hold";
  booking.cancellationTimeline.push({ action: "cancelled", status: refundStatus, note, actor: req.user._id });
  await booking.save();
  await safeSyncBookingToGoogle(booking._id);
  res.status(201).json({ success: true, message: "Booking cancelled and refund eligibility calculated.", booking, cancellation });
});

export const getCancellation = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "booking id");
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "Booking not found.");
  const access = await bookingAccess(booking, req.user); if (!access.allowed) throw new ApiError(403, "You cannot view this cancellation.");
  const cancellation = await CancellationRequest.findOne({ booking: booking._id }).populate("cancelledBy reviewedBy timeline.actor", "name role");
  if (!cancellation) throw new ApiError(404, "Cancellation not found.");
  res.json({ success: true, cancellation });
});

export const disputeCancellation = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "booking id");
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : ""; if (!reason) throw new ApiError(400, "Dispute reason is required.");
  const booking = await Booking.findById(req.params.id); if (!booking) throw new ApiError(404, "Booking not found.");
  const access = await bookingAccess(booking, req.user); if (!access.isCustomer && !access.isVendor) throw new ApiError(403, "Only the customer or vendor can open a dispute.");
  const cancellation = await CancellationRequest.findOne({ booking: booking._id }); if (!cancellation) throw new ApiError(404, "Cancellation not found.");
  if (["refunded", "disputed"].includes(cancellation.refundStatus)) throw new ApiError(409, "This cancellation cannot be disputed.");
  cancellation.refundStatus = "disputed"; cancellation.disputeReason = reason; cancellation.disputedAt = new Date(); cancellation.timeline.push({ action: "disputed", status: "disputed", note: reason, actor: req.user._id }); await cancellation.save();
  booking.refundStatus = "disputed"; booking.cancellationTimeline.push({ action: "disputed", status: "disputed", note: reason, actor: req.user._id }); await booking.save();
  res.json({ success: true, message: "Dispute submitted for admin review.", cancellation });
});

export const listCancellations = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { refundStatus: req.query.status } : {};
  const cancellations = await CancellationRequest.find(filter).populate("customer", "name email").populate("vendor", "businessName").populate("cancelledBy", "name role").sort({ cancelledAt: -1 }).limit(500);
  res.json({ success: true, cancellations });
});

export const reviewRefund = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "cancellation id");
  const decision = req.body?.decision; const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!["approve", "reject"].includes(decision)) throw new ApiError(400, "Decision must be approve or reject.");
  if (!reason) throw new ApiError(400, "Review reason is required.");
  const cancellation = await CancellationRequest.findById(req.params.id); if (!cancellation) throw new ApiError(404, "Cancellation not found.");
  if (!["pending_review", "disputed"].includes(cancellation.refundStatus)) throw new ApiError(409, "This refund has already been reviewed.");
  const booking = await Booking.findById(cancellation.booking);
  cancellation.reviewedBy = req.user._id; cancellation.reviewedAt = new Date(); cancellation.refundReason = reason;
  if (decision === "reject") {
    cancellation.refundStatus = "rejected"; cancellation.timeline.push({ action: "refund_rejected", status: "rejected", note: reason, actor: req.user._id });
    booking.refundStatus = "rejected"; booking.refundReason = reason;
  } else {
    cancellation.refundStatus = cancellation.refundAmount ? "processing" : "not_applicable";
    cancellation.timeline.push({ action: "refund_approved", status: cancellation.refundStatus, note: reason, actor: req.user._id });
    booking.refundStatus = cancellation.refundStatus; booking.refundReason = reason;
    if (cancellation.refundAmount) {
      await Promise.all([cancellation.save(), booking.save()]);
      try {
        await initiateBookingRefund({ bookingId: booking._id, amount: cancellation.refundAmount, reason, admin: req.user });
      } catch (error) {
        cancellation.refundStatus = "failed"; booking.refundStatus = "failed";
        cancellation.timeline.push({ action: "refund_failed", status: "failed", note: error.message, actor: req.user._id });
        booking.cancellationTimeline.push({ action: "refund_failed", status: "failed", note: error.message, actor: req.user._id });
        await Promise.all([cancellation.save(), booking.save()]);
        throw error;
      }
    }
  }
  const event = cancellation.timeline.at(-1);
  booking.cancellationTimeline.push({ action: event.action, status: event.status, note: event.note, actor: event.actor, at: event.at });
  await Promise.all([cancellation.save(), booking.save()]);
  res.json({ success: true, message: decision === "approve" ? "Refund approved and initiated." : "Refund rejected.", cancellation });
});

export const vendorCancellationHistory = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ userId: req.user._id }); if (!vendor) throw new ApiError(404, "Vendor profile not found.");
  const cancellations = await CancellationRequest.find({ vendor: vendor._id }).populate("customer", "name email").sort({ cancelledAt: -1 });
  res.json({ success: true, cancellations });
});
