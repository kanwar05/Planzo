import { api } from "./api";

export const getBookingPaymentHistory = async bookingId =>
  (await api.get(`/payments/bookings/${bookingId}`)).data;

export const createPaymentOrder = async (bookingId, installment, idempotencyKey) =>
  (await api.post(`/payments/bookings/${bookingId}/orders`, { installment }, {
    headers: { "Idempotency-Key": idempotencyKey },
  })).data;

export const verifyPayment = async response =>
  (await api.post("/payments/verify", response)).data;

export const getVendorSettlement = async () =>
  (await api.get("/payments/vendor/settlements")).data.settlement;

export const downloadPaymentDocument = async (path, filename) => {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
