import { api } from "./api";

export const createBooking = async (data) => {
  const response = await api.post("/bookings", data);
  return response.data.booking;
};

export const getMyBookings = async () => {
  const response = await api.get("/bookings/my-bookings");
  return response.data.bookings;
};

export const getVendorRequests = async () => {
  const response = await api.get("/bookings/vendor-requests");
  return response.data.bookings;
};

export const updateBookingStatus = async (id, status) => {
  const response = await api.patch(`/bookings/${id}/status`, { status });
  return response.data.booking;
};

export const cancelBookingRequest = async (id, reason) => (await api.post(`/bookings/${id}/cancel`, { reason })).data;
export const getCancellation = async (id) => (await api.get(`/bookings/${id}/cancellation`)).data.cancellation;
export const disputeCancellation = async (id, reason) => (await api.post(`/bookings/${id}/cancellation/dispute`, { reason })).data.cancellation;
export const getVendorCancellationHistory = async () => (await api.get("/bookings/vendor-history")).data.cancellations;
export const getAdminCancellations = async (params = {}) => (await api.get("/admin/cancellations", { params })).data.cancellations;
export const reviewCancellationRefund = async (id, decision, reason) => (await api.patch(`/admin/cancellations/${id}/refund`, { decision, reason })).data.cancellation;
