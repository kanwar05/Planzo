import { api } from "./api";

export const getQuotations = async bookingId => (await api.get(`/bookings/${bookingId}/quotations`)).data.quotations;
export const sendQuotation = async (bookingId, data, idempotencyKey) => (await api.post(`/bookings/${bookingId}/quotations`, data, { headers: { "Idempotency-Key": idempotencyKey } })).data;
export const acceptQuotation = async (bookingId, revision) => (await api.post(`/bookings/${bookingId}/quotations/${revision}/accept`)).data.booking;
export const rejectQuotation = async (bookingId, revision) => (await api.post(`/bookings/${bookingId}/quotations/${revision}/reject`)).data.booking;
