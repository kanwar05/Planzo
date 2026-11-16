import { api } from "./api";

export const getConversation = async (bookingId, options = {}) =>
  (await api.get(`/bookings/${bookingId}/conversation`, options)).data;
export const getMessages = async (bookingId, params = {}, options = {}) =>
  (await api.get(`/bookings/${bookingId}/messages`, { ...options, params })).data;
export const sendMessage = async (bookingId, message) =>
  (await api.post(`/bookings/${bookingId}/messages`, message)).data;
export const markConversationRead = async (bookingId, throughSequence) =>
  (await api.patch(`/bookings/${bookingId}/conversation/read`, { throughSequence })).data;
export const getUnreadCounts = async bookingIds =>
  (await api.get("/conversations/unread", { params: { bookingIds: bookingIds.join(",") } })).data;
