import { Server } from "socket.io";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { ACCESS_COOKIE_NAME, verifyAccessToken } from "../utils/generateToken.js";
import { assertConversationMember, createMessage, markConversationRead, markDelivered } from "../services/chatService.js";

const parseCookies = (header = "") => Object.fromEntries(
  header.split(";").map((part) => part.trim().split("=")).filter(([key]) => key).map(([key, value = ""]) => [key, decodeURIComponent(value)]),
);

export const initializeChatSocket = (httpServer, app) => {
  const origins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((x) => x.trim()).filter(Boolean);
  const io = new Server(httpServer, { cors: { origin: origins, credentials: true }, maxHttpBufferSize: 12 * 1024 * 1024 });
  const online = new Map();
  const isOnline = (id) => (online.get(String(id))?.size || 0) > 0;

  io.use(async (socket, next) => {
    try {
      const bearer = socket.handshake.auth?.token;
      const token = bearer || parseCookies(socket.handshake.headers.cookie)[ACCESS_COOKIE_NAME];
      if (!token) throw new Error("Authentication required.");
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.id);
      if (!user || (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime())) throw new Error("Invalid session.");
      socket.user = user;
      next();
    } catch {
      next(new Error("Authentication failed."));
    }
  });

  const broadcastPresence = async (userId, status) => {
    const lastSeenAt = status === "offline" ? new Date() : null;
    if (lastSeenAt) await User.findByIdAndUpdate(userId, { lastSeenAt });
    io.emit("presence:update", { userId: String(userId), status, lastSeenAt });
  };

  const gateway = {
    async broadcastMessage(message) {
      const conversation = await Conversation.findById(message.conversation);
      if (!conversation) return;
      const recipient = conversation.participants.find((id) => String(id) !== String(message.sender?._id || message.sender));
      if (isOnline(recipient)) {
        const now = new Date();
        await Message.findByIdAndUpdate(message._id, { $addToSet: { deliveredTo: recipient }, $set: { deliveredAt: now } });
        message.deliveredTo.push(recipient); message.deliveredAt = now;
      }
      io.to(`conversation:${conversation._id}`).to(`user:${recipient}`).emit("message:new", message);
      io.to(`user:${recipient}`).emit("unread:update", { conversationId: String(conversation._id) });
    },
    broadcastSeen(conversationId, userId, seenAt) {
      io.to(`conversation:${conversationId}`).emit("message:seen", { conversationId, userId: String(userId), seenAt });
    },
    broadcastDeleted(message) {
      io.to(`conversation:${message.conversation}`).emit("message:deleted", { messageId: String(message._id), conversationId: String(message.conversation), deletedAt: message.deletedAt });
    },
  };
  app.set("chatGateway", gateway);

  io.on("connection", (socket) => {
    const userId = String(socket.user._id);
    socket.join(`user:${userId}`);
    const sockets = online.get(userId) || new Set(); sockets.add(socket.id); online.set(userId, sockets);
    if (sockets.size === 1) broadcastPresence(userId, "online");

    socket.on("presence:query", (ids, ack) => {
      const result = (Array.isArray(ids) ? ids : []).slice(0, 100).map((id) => ({ userId: String(id), status: isOnline(id) ? "online" : "offline" }));
      ack?.({ success: true, presence: result });
    });

    socket.on("conversation:join", async ({ conversationId }, ack) => {
      try {
        const conversation = await Conversation.findById(conversationId); assertConversationMember(conversation, userId);
        socket.join(`conversation:${conversationId}`);
        const deliveredAt = await markDelivered({ conversationId, userId });
        io.to(`conversation:${conversationId}`).emit("message:delivered", { conversationId, userId, deliveredAt });
        ack?.({ success: true });
      } catch (error) { ack?.({ success: false, message: error.message }); }
    });
    socket.on("conversation:leave", ({ conversationId }) => socket.leave(`conversation:${conversationId}`));
    socket.on("typing:start", async ({ conversationId }) => {
      const conversation = await Conversation.findById(conversationId); if (!conversation) return;
      try { assertConversationMember(conversation, userId); socket.to(`conversation:${conversationId}`).emit("typing:update", { conversationId, userId, typing: true }); } catch {}
    });
    socket.on("typing:stop", async ({ conversationId }) => {
      const conversation = await Conversation.findById(conversationId); if (!conversation) return;
      try { assertConversationMember(conversation, userId); socket.to(`conversation:${conversationId}`).emit("typing:update", { conversationId, userId, typing: false }); } catch {}
    });
    socket.on("message:send", async ({ conversationId, text }, ack) => {
      try {
        const message = await createMessage({ conversationId, user: socket.user, text });
        await gateway.broadcastMessage(message);
        ack?.({ success: true, message });
      } catch (error) { ack?.({ success: false, message: error.message }); }
    });
    socket.on("message:seen", async ({ conversationId }, ack) => {
      try {
        const result = await markConversationRead({ conversationId, userId });
        gateway.broadcastSeen(conversationId, userId, result.seenAt);
        ack?.({ success: true, seenAt: result.seenAt });
      } catch (error) { ack?.({ success: false, message: error.message }); }
    });
    socket.on("disconnect", () => {
      const current = online.get(userId); current?.delete(socket.id);
      if (!current?.size) { online.delete(userId); broadcastPresence(userId, "offline"); }
    });
  });
  return { io, gateway };
};
