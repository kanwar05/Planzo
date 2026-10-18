import Vendor from "../models/Vendor.js";
import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";
import { bookingView, populateBooking, updateBookingStatus } from "./bookingController.js";
import { vendorView } from "../services/vendorSearchService.js";

const pagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};
const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const userFields = "_id name email phone role accountStatus suspendedAt suspensionReason createdAt";

export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.role) {
    if (!["customer", "vendor", "admin"].includes(req.query.role)) throw new ApiError(400, "Invalid user role.");
    filter.role = req.query.role;
  }
  const [users, total] = await Promise.all([
    User.find(filter).select(userFields).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, users, count: users.length, pagination: pageInfo(page, limit, total) });
});

export const getVendorsForAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  const status = req.query.status;
  if (status) {
    if (!["pending", "approved", "rejected"].includes(status)) throw new ApiError(400, "Invalid approval status.");
    filter.$or = [{ verificationStatus: status }];
    if (status === "approved") filter.$or.push({ verificationStatus: { $exists: false }, verified: true });
    if (status === "pending") filter.$or.push({ verificationStatus: { $exists: false }, verified: { $ne: true } });
  }
  const [rows, total] = await Promise.all([
    Vendor.find(filter).select("+contactDetails").populate("userId", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Vendor.countDocuments(filter),
  ]);
  res.json({ success: true, vendors: rows.map((vendor) => vendorView(vendor, { owner: true })),
    count: rows.length, pagination: pageInfo(page, limit, total) });
});
export const getUnverifiedVendors = (req, res, next) => {
  req.query.status = "pending";
  return getVendorsForAdmin(req, res, next);
};

function approval(status) {
  return asyncHandler(async (req, res) => {
    validateObjectId(req.params.vendorId, "vendor id");
    if (req.body.reason !== undefined && (typeof req.body.reason !== "string" || req.body.reason.length > 1000)) throw new ApiError(400, "Reason must be text up to 1000 characters.");
    const vendor = await Vendor.findById(req.params.vendorId).select("+contactDetails");
    if (!vendor) throw new ApiError(404, "Vendor not found.");
    vendor.verificationStatus = status;
    vendor.verificationRejectionReason = status === "rejected" ? (req.body.reason || "").trim() : "";
    await vendor.save();
    res.json({ success: true, message: status === "approved" ? "Vendor approved." : "Vendor rejected.",
      vendor: vendorView(vendor, { owner: true }) });
  });
}
export const verifyVendor = approval("approved");
export const rejectVendor = approval("rejected");

async function suspendUser(req, userId) {
  validateObjectId(userId, "user id");
  if (typeof req.body.suspended !== "boolean") throw new ApiError(400, "suspended must be a boolean.");
  if (String(req.user._id) === String(userId)) throw new ApiError(400, "You cannot suspend your own account.");
  const suspended = req.body.suspended;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (suspended && (!reason || reason.length > 1000)) throw new ApiError(400, "Provide a suspension reason up to 1000 characters.");
  const user = await User.findById(userId).select(userFields);
  if (!user) throw new ApiError(404, "User not found.");
  user.suspendedAt = suspended ? new Date() : null;
  user.suspensionReason = suspended ? reason : "";
  await user.save({ validateBeforeSave: false });
  await Vendor.updateOne({ userId: user._id }, { $set: { suspended, suspendedAt: user.suspendedAt } });
  if (suspended) {
    await User.updateOne({ _id: user._id }, { $inc: { authVersion: 1 } });
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  }
  return user;
}
export const setUserSuspension = asyncHandler(async (req, res) => {
  const user = await suspendUser(req, req.params.userId);
  res.json({ success: true, message: req.body.suspended ? "User suspended." : "Suspension removed.", user });
});
export const setVendorSuspension = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");
  const vendor = await Vendor.findById(req.params.vendorId);
  if (!vendor) throw new ApiError(404, "Vendor not found.");
  const user = await suspendUser(req, vendor.userId);
  res.json({ success: true, message: req.body.suspended ? "Vendor suspended." : "Suspension removed.", user });
});

export const getBookingsForAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.status) {
    if (!BOOKING_STATUSES.includes(req.query.status)) throw new ApiError(400, "Invalid booking status.");
    filter.status = req.query.status;
  }
  const [rows, total] = await Promise.all([
    populateBooking(Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)),
    Booking.countDocuments(filter),
  ]);
  res.json({ success: true, bookings: rows.map((booking) => bookingView(booking, req.user)),
    count: rows.length, pagination: pageInfo(page, limit, total) });
});
export const editBooking = updateBookingStatus;

export const getAdminStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalCustomers, totalVendors, pendingVendors, counts] = await Promise.all([
    User.countDocuments(), User.countDocuments({ role: "customer" }), Vendor.countDocuments(),
    Vendor.countDocuments({ $or: [{ verificationStatus: "pending" }, { verificationStatus: { $exists: false }, verified: { $ne: true } }] }),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const statuses = Object.fromEntries(counts.map((row) => [row._id, row.count]));
  res.json({ success: true, stats: { totalUsers, totalCustomers, totalVendors, pendingVendors,
    totalBookings: counts.reduce((sum, row) => sum + row.count, 0),
    pendingBookings: statuses.pending || 0, acceptedBookings: statuses.accepted || 0,
    completedBookings: statuses.completed || 0, rejectedBookings: statuses.rejected || 0,
    cancelledBookings: statuses.cancelled || 0,
  } });
});
