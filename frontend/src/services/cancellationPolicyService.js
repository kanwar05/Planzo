import { api } from "./api";

export const getCurrentCancellationPolicy = async () => (await api.get("/cancellation-policies")).data.policy;
export const getBookingCancellationPolicy = async bookingId => (await api.get(`/bookings/${bookingId}/cancellation-policy`)).data;
export const getCancellationPolicies = async params => (await api.get("/admin/cancellation-policies", { params })).data;
export const publishCancellationPolicy = async data => (await api.post("/admin/cancellation-policies", data)).data;
