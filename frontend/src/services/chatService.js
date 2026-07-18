import { io } from "socket.io-client";
import { api } from "./api";

const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL || "http://localhost:5001/api").replace(/\/api\/?$/, "");
let socket;
export const getChatSocket = () => {
  if (!socket) socket = io(socketUrl, { withCredentials: true, autoConnect: false, transports: ["websocket", "polling"] });
  return socket;
};
export const listConversations = async () => (await api.get("/chat/conversations")).data;
export const createConversation = async (payload) => (await api.post("/chat/conversations", payload)).data.conversation;
export const getMessages = async (id, params = {}) => (await api.get(`/chat/conversations/${id}/messages`, { params })).data;
export const sendAttachmentMessage = async (id, text, files) => {
  const form = new FormData(); if (text) form.append("text", text); files.forEach((file) => form.append("attachments", file));
  return (await api.post(`/chat/conversations/${id}/messages`, form, { timeout: 120000 })).data.message;
};
export const markConversationRead = async (id) => (await api.patch(`/chat/conversations/${id}/read`)).data;
export const deleteMessage = async (id) => (await api.delete(`/chat/messages/${id}`)).data.message;
export const deleteConversation = async (id) => (await api.delete(`/chat/conversations/${id}`)).data;
