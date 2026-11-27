import { api } from "./api";
export const getAdminStats = async () => (await api.get("/admin/stats")).data.stats;
export const getAdminFinancials = async () => (await api.get("/admin/financials")).data.report;
export const createPaymentRefund = async (paymentId, amountPaise, reason, idempotencyKey) =>
  (await api.post(`/admin/payments/${paymentId}/refunds`, { amountPaise, reason }, {
    headers: { "Idempotency-Key": idempotencyKey },
  })).data.refund;
export const resolvePaymentException = async (exceptionId, resolutionNote) =>
  (await api.patch(`/admin/financials/exceptions/${exceptionId}`, { resolutionNote })).data.exception;
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
export const reviewVendor = async (id, approved, reason, profileRevision) => (await api.patch(`/admin/vendors/${id}/${approved ? "verify" : "reject"}`, {
  reason,
  profileRevision
})).data.vendor;
export const setVendorSuspension = async (id, suspended, reason, profileRevision) => (await api.patch(`/admin/vendors/${id}/suspension`, {
  suspended,
  reason,
  profileRevision
})).data.user;
export const getVendorModerationAudit = async (id, params) => (await api.get(`/admin/vendors/${id}/audit`, {
  params
})).data;
export const getAdminBookings = async params => (await api.get("/admin/bookings", {
  params
})).data;
