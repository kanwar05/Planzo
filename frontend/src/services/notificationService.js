import {api} from "./api.js";

export async function getNotifications(params = {}) {
  const response = await api.get("/notifications", { params });
  return response.data.data || response.data;
}

export async function getNotificationStats() {
  const response = await api.get("/notifications/stats");
  return response.data.data || response.data;
}

export async function markNotificationAsRead(notificationId) {
  const response = await api.patch(`/notifications/${notificationId}/read`);
  return response.data.data || response.data;
}

export async function markAllNotificationsAsRead() {
  const response = await api.patch("/notifications/read-all");
  return response.data.data || response.data;
}

export async function deleteNotification(notificationId) {
  const response = await api.delete(`/notifications/${notificationId}`);
  return response.data.data || response.data;
}

export async function deleteAllNotifications() {
  const response = await api.delete("/notifications");
  return response.data.data || response.data;
}
