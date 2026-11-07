import Vendor from "../models/Vendor.js";
import Booking, { BOOKING_STATUSES } from "../models/Booking.js";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import VendorModerationAudit from "../models/VendorModerationAudit.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";
import {
  bookingView,
  populateBooking,
  updateBookingStatus,
} from "./bookingController.js";
import { vendorView } from "../services/vendorSearchService.js";
import {
  assertReviewableVendor, vendorProfileCompletion, vendorRevisionFilter,
} from "../services/vendorProfileService.js";
import { withBookingTransaction } from "../utils/vendorBookingTransaction.js";
import { activeAccountFilter } from "../utils/accountEligibility.js";

const pagination = (query) => {
  const integer = (value, fallback, maximum) => {
    if (value === undefined || value === "") return fallback;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || Number(value) > maximum)
      throw new ApiError(400, "Invalid pagination parameter.");
    return Number(value);
  };
  const page = integer(query.page, 1, 100000);
  const limit = integer(query.limit, 20, 100);
  return { page, limit, skip: (page - 1) * limit };
};
const pageInfo = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});
const userFields =
  "_id name email phone role accountStatus suspendedAt suspensionReason createdAt";
const adminVendorView = (vendor) => ({
  ...vendorView(vendor, { owner: true }),
  profileCompletion: vendorProfileCompletion(vendor),
});
const optionalText = (value, name, maximum = 160) => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > maximum)
    throw new ApiError(400, `${name} must be text up to ${maximum} characters.`);
  return value.trim();
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inspectedRevision = (body) => {
  if (body.profileRevision === undefined) return undefined;
  if (!Number.isSafeInteger(body.profileRevision) || body.profileRevision < 0)
    throw new ApiError(400, "Provide a valid profile revision.");
  return body.profileRevision;
};
const activeAccount = (user) => [undefined, null, "active"].includes(user.accountStatus);

export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.role) {
    if (!["customer", "vendor", "admin"].includes(req.query.role))
      throw new ApiError(400, "Invalid user role.");
    filter.role = req.query.role;
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .select(userFields)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({
    success: true,
    users,
    count: users.length,
    pagination: pageInfo(page, limit, total),
  });
});

export const getVendorsForAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  const status = optionalText(req.query.status, "Approval status");
  if (status) {
    if (!["pending", "approved", "rejected"].includes(status))
      throw new ApiError(400, "Invalid approval status.");
    filter.$or = [{ verificationStatus: status }];
    if (status === "approved")
      filter.$or.push({
        verificationStatus: { $exists: false },
        verified: true,
      });
    if (status === "pending")
      filter.$or.push({
        verificationStatus: { $exists: false },
        verified: { $ne: true },
      });
  }
  if (req.query.suspended !== undefined && req.query.suspended !== "") {
    if (!["true", "false"].includes(req.query.suspended))
      throw new ApiError(400, "Suspended must be true or false.");
    filter.suspended = req.query.suspended === "true" ? true : { $ne: true };
  }
  const search = optionalText(req.query.search, "Search");
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    filter.$and = [{ $or: [
      { businessName: expression }, { serviceCategory: expression },
      { location: expression }, { city: expression }, { serviceAreas: expression }, { servicesOffered: expression },
    ] }];
  }
  const [rows, total] = await Promise.all([
    Vendor.find(filter)
      .select("+contactDetails +profileRevision")
      .populate("userId", "name email role accountStatus suspendedAt suspensionReason")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit),
    Vendor.countDocuments(filter),
  ]);
  res.json({
    success: true,
    vendors: rows.map(adminVendorView),
    count: rows.length,
    pagination: pageInfo(page, limit, total),
  });
});
export const getUnverifiedVendors = (req, res, next) => {
  req.query.status = "pending";
  return getVendorsForAdmin(req, res, next);
};

function approval(status) {
  return asyncHandler(async (req, res) => {
    validateObjectId(req.params.vendorId, "vendor id");
    const reason = optionalText(req.body.reason, "Reason", 1000);
    const requestedRevision = inspectedRevision(req.body);
    const original = await Vendor.findById(req.params.vendorId).select(
      "+contactDetails +profileRevision",
    );
    if (!original) throw new ApiError(404, "Vendor not found.");
    const expectedRevision = requestedRevision ?? original.profileRevision ?? 0;
    const vendor = await withBookingTransaction(async (session) => {
      // Account guards precede vendor writes, matching deactivation/suspension.
      const owner = await User.findOneAndUpdate(
        { _id: original.userId, role: "vendor", ...activeAccountFilter() },
        { $inc: { bookingGuardRevision: 1 } },
        { new: true, session, timestamps: false },
      );
      if (status === "approved" && !owner)
        throw new ApiError(409, "Only an active vendor account can have an approved listing.");
      const current = await Vendor.findById(original._id).select("+contactDetails +profileRevision").session(session);
      if (!current) throw new ApiError(404, "Vendor not found.");
      if (status === "approved") {
        if (current.suspended) throw new ApiError(409, "Restore the vendor account before approving its listing.");
        assertReviewableVendor(current);
      }
      if (current.verificationStatus === status) return current;
      const updated = await Vendor.findOneAndUpdate(
        { _id: current._id, userId: original.userId, ...vendorRevisionFilter(expectedRevision) },
        { $set: {
          verificationStatus: status, verified: status === "approved",
          verificationRejectionReason: status === "rejected" ? reason : "",
        }, $inc: { profileRevision: 1 } },
        { new: true, session, runValidators: true },
      ).select("+contactDetails +profileRevision");
      if (!updated) throw new ApiError(409, "The profile changed. Refresh and inspect it before deciding.");
      await VendorModerationAudit.create([{
        actorId: req.user._id, targetUserId: current.userId, vendorId: current._id,
        action: status === "approved" ? "approve" : "reject",
        fromState: current.verificationStatus || "pending", toState: status,
        reason, profileRevision: updated.profileRevision,
      }], { session });
      return updated;
    });
    res.json({
      success: true,
      message: status === "approved" ? "Vendor approved." : "Vendor rejected.",
      vendor: adminVendorView(vendor),
    });
  });
}
export const verifyVendor = approval("approved");
export const rejectVendor = approval("rejected");

async function suspendUser(req, userId, expectedVendorId) {
  validateObjectId(userId, "user id");
  if (typeof req.body.suspended !== "boolean")
    throw new ApiError(400, "suspended must be a boolean.");
  if (String(req.user._id) === String(userId))
    throw new ApiError(400, "You cannot suspend your own account.");
  const suspended = req.body.suspended;
  const reason = optionalText(req.body.reason, "Reason", 1000);
  const requestedRevision = inspectedRevision(req.body);
  if (suspended && !reason)
    throw new ApiError(
      400,
      "Provide a suspension reason up to 1000 characters.",
    );
  return withBookingTransaction(async (session) => {
    const user = await User.findOneAndUpdate(
      { _id: userId }, { $inc: { bookingGuardRevision: 1 } },
      { new: true, session, timestamps: false },
    ).select(userFields);
    if (!user) throw new ApiError(404, "User not found.");
    const vendor = await Vendor.findOne({ userId: user._id }).select("+profileRevision").session(session);
    if (expectedVendorId && String(vendor?._id) !== String(expectedVendorId))
      throw new ApiError(409, "The vendor owner changed. Refresh and try again.");
    if (!suspended && !activeAccount(user))
      throw new ApiError(409, "A deactivated or inactive account cannot be restored through suspension controls.");
    if (Boolean(user.suspendedAt) === suspended && (!vendor || Boolean(vendor.suspended) === suspended))
      return user;
    if (requestedRevision !== undefined && vendor && requestedRevision !== (vendor.profileRevision || 0))
      throw new ApiError(409, "The profile changed. Refresh before changing its suspension.");
    const suspendedAt = suspended ? new Date() : null;
    const updatedUser = await User.findByIdAndUpdate(user._id, {
      $set: { suspendedAt, suspensionReason: suspended ? reason : "" },
      ...(suspended ? { $inc: { authVersion: 1 } } : {}),
    }, { new: true, session }).select(userFields);
    let updatedVendor;
    if (vendor) {
      updatedVendor = await Vendor.findOneAndUpdate(
        { _id: vendor._id, ...vendorRevisionFilter(vendor) },
        { $set: { suspended, suspendedAt }, $inc: { profileRevision: 1 } },
        { new: true, session },
      ).select("+profileRevision");
      if (!updatedVendor) throw new ApiError(409, "The profile changed. Refresh and try again.");
    }
    if (suspended) await RefreshToken.updateMany(
      { userId: user._id, revokedAt: null }, { $set: { revokedAt: suspendedAt } }, { session },
    );
    await VendorModerationAudit.create([{
      actorId: req.user._id, targetUserId: user._id, vendorId: vendor?._id || null,
      action: suspended ? "suspend" : "restore",
      fromState: user.suspendedAt ? "suspended" : "not_suspended",
      toState: suspended ? "suspended" : "not_suspended", reason,
      profileRevision: updatedVendor?.profileRevision ?? null,
    }], { session });
    return updatedUser;
  });
}
export const setUserSuspension = asyncHandler(async (req, res) => {
  const user = await suspendUser(req, req.params.userId);
  res.json({
    success: true,
    message: req.body.suspended ? "User suspended." : "Suspension removed.",
    user,
  });
});
export const setVendorSuspension = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");
  const vendor = await Vendor.findById(req.params.vendorId);
  if (!vendor) throw new ApiError(404, "Vendor not found.");
  const user = await suspendUser(req, vendor.userId, vendor._id);
  res.json({
    success: true,
    message: req.body.suspended ? "Vendor suspended." : "Suspension removed.",
    user,
  });
});

export const getVendorModerationAudit = asyncHandler(async (req, res) => {
  validateObjectId(req.params.vendorId, "vendor id");
  if (!await Vendor.exists({ _id: req.params.vendorId }))
    throw new ApiError(404, "Vendor not found.");
  const { page, limit, skip } = pagination(req.query);
  const filter = { vendorId: req.params.vendorId };
  const [records, total] = await Promise.all([
    VendorModerationAudit.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
      .populate("actorId", "name"),
    VendorModerationAudit.countDocuments(filter),
  ]);
  res.json({ success: true, records, count: records.length, pagination: pageInfo(page, limit, total) });
});

export const getBookingsForAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.status) {
    if (!BOOKING_STATUSES.includes(req.query.status))
      throw new ApiError(400, "Invalid booking status.");
    filter.status = req.query.status;
  }
  const [rows, total] = await Promise.all([
    populateBooking(
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ),
    Booking.countDocuments(filter),
  ]);
  res.json({
    success: true,
    bookings: rows.map((booking) => bookingView(booking, req.user)),
    count: rows.length,
    pagination: pageInfo(page, limit, total),
  });
});
export const editBooking = updateBookingStatus;

export const getAdminStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalCustomers, totalVendors, pendingVendors, counts] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "customer" }),
      Vendor.countDocuments(),
      Vendor.countDocuments({
        $or: [
          { verificationStatus: "pending" },
          { verificationStatus: { $exists: false }, verified: { $ne: true } },
        ],
      }),
      Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
  const statuses = Object.fromEntries(
    counts.map((row) => [row._id, row.count]),
  );
  res.json({
    success: true,
    stats: {
      totalUsers,
      totalCustomers,
      totalVendors,
      pendingVendors,
      totalBookings: counts.reduce((sum, row) => sum + row.count, 0),
      pendingBookings: statuses.pending || 0,
      acceptedBookings: statuses.accepted || 0,
      completedBookings: statuses.completed || 0,
      rejectedBookings: statuses.rejected || 0,
      cancelledBookings: statuses.cancelled || 0,
    },
  });
});
