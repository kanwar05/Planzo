import Notification from "../models/Notification.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateObjectId } from "../utils/validation.js";

export const getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100,
  );
  const unreadOnly = req.query.unreadOnly === "true";

  const filters = { userId: req.user._id };
  if (unreadOnly) filters.read = false;

  const [notifications, total] = await Promise.all([
    Notification.find(filters)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filters),
  ]);

  // Get unread count
  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    read: false,
  });

  res.status(200).json({
    success: true,
    unreadCount,
    count: notifications.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    notifications,
  });
});

export const getNotificationStats = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    read: false,
  });

  const totalCount = await Notification.countDocuments({
    userId: req.user._id,
  });

  res.status(200).json({
    success: true,
    unreadCount,
    totalCount,
  });
});

export const markAsRead = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "notification id");

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true },
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  res.status(200).json({
    success: true,
    message: "Notification marked as read.",
    notification,
  });
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, read: false },
    { read: true },
  );

  res.status(200).json({
    success: true,
    message: "All notifications marked as read.",
    modifiedCount: result.modifiedCount,
  });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "notification id");

  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  res.status(200).json({
    success: true,
    message: "Notification deleted successfully.",
  });
});

export const deleteAllNotifications = asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({
    userId: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "All notifications deleted successfully.",
    deletedCount: result.deletedCount,
  });
});

// Internal function to create notifications (called from booking/review controllers)
// NOT wrapped with asyncHandler - this is a helper function, not a route handler
export const createNotification = async (
  userId,
  type,
  title,
  message,
  relatedIds = {},
) => {
  const notification = await Notification.create({
    userId,
    type,
    title,
    message,
    bookingId: relatedIds.bookingId || null,
    reviewId: relatedIds.reviewId || null,
    vendorId: relatedIds.vendorId || null,
    actionUrl: relatedIds.actionUrl || null,
  });
  return notification;
};

export const safeCreateNotification = async (...args) => {
  try {
    return await createNotification(...args);
  } catch (error) {
    console.error(`Notification creation failed: ${error.message}`);
    return null;
  }
};
