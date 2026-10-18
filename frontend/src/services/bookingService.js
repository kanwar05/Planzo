import { api } from "./api";
export const createBooking = async data => (await api.post("/bookings", data)).data.booking;
export const getMyBookings = async () => (await api.get("/bookings/my-bookings")).data.bookings;
export const getVendorRequests = async () => (await api.get("/bookings/vendor-requests")).data.bookings;
export const updateBookingStatus = async (id, status, reason) => (await api.patch(`/bookings/${id}/status`, {
  status,
  ...(reason ? {
    reason
  } : {})
})).data.booking;
