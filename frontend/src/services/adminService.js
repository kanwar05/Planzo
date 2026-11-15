import { api } from "./api";
export const getAdminStats = async () => (await api.get("/admin/stats")).data.stats;
export const getAdminUsers = async params => (await api.get("/admin/users", {
  params
})).data;
export const setUserSuspension = async (id, suspended, reason) => (await api.patch(`/admin/users/${id}/suspension`, {
  suspended,
  reason
})).data.user;
export const getAdminVendors = async params => (await api.get("/admin/vendors", {
  params
})).data;
export const reviewVendor = async (id, approved, reason) => (await api.patch(`/admin/vendors/${id}/${approved ? "verify" : "reject"}`, {
  reason
})).data.vendor;
export const getAdminBookings = async params => (await api.get("/admin/bookings", {
  params
})).data;
