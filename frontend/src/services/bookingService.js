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
