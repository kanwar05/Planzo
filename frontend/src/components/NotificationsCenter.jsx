import { Bell, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "./Button";
import {
  deleteAllNotifications,
  deleteNotification,
  getNotifications,
  getNotificationStats,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../services/notificationService";
import { getApiError } from "../utils/apiError";

const NOTIFICATION_TYPE_COLORS = {
  booking_update: "bg-blue-50 border-blue-200",
  review_reminder: "bg-amber-50 border-amber-200",
  vendor_reply: "bg-green-50 border-green-200",
  profile_completion_nudge: "bg-purple-50 border-purple-200",
};

const NOTIFICATION_TYPE_TITLES = {
  booking_update: "Booking Update",
  review_reminder: "Review Reminder",
  vendor_reply: "Vendor Reply",
  profile_completion_nudge: "Profile Completion",
};

export default function NotificationsCenter({ isOpen, onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, page]);

  const loadNotifications = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getNotifications({ page, limit: 15 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(getApiError(err, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((notif) =>
          notif._id === notificationId ? { ...notif, read: true } : notif,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(getApiError(err, "Failed to mark notification as read"));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(getApiError(err, "Failed to mark all as read"));
    }
  };

  const handleDeleteNotification = async (notificationId) => {
    try {
      await deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
      loadNotifications();
    } catch (err) {
      setError(getApiError(err, "Failed to delete notification"));
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("Are you sure you want to delete all notifications?")) {
      return;
    }
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      setError(getApiError(err, "Failed to delete all notifications"));
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Notifications Panel */}
      <div className="relative h-screen w-full max-w-md flex-col bg-white shadow-lg sm:flex">
        {/* Header */}
        <div className="sticky top-0 border-b bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-coral" />
              <h2 className="text-lg font-bold">Notifications</h2>
              {unreadCount > 0 && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-coral text-xs font-bold text-white">
                  {Math.min(unreadCount, 99)}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="border-b px-4 py-3 flex gap-2">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkAllAsRead}
                className="text-xs"
              >
                Mark all as read
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDeleteAll}
              className="text-xs"
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-coral border-t-transparent" />
                <p className="text-sm text-ink/50">Loading...</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center">
              <Bell className="mb-4 h-12 w-12 text-ink/20" />
              <p className="text-center text-sm text-ink/50">
                No notifications yet
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {notifications.map((notification) => (
                <div
                  key={notification._id}
                  onClick={() =>
                    !notification.read && handleMarkAsRead(notification._id)
                  }
                  className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                    NOTIFICATION_TYPE_COLORS[notification.type] ||
                    "bg-gray-50 border-gray-200"
                  } ${!notification.read ? "font-semibold" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold">{notification.title}</p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-coral" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-ink/70">
                        {notification.message}
                      </p>
                      <p className="mt-2 text-xs text-ink/50">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(notification._id);
                      }}
                      className="flex-shrink-0 rounded-lg p-2 hover:bg-white/50"
                    >
                      <Trash2 className="h-4 w-4 text-ink/50" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
