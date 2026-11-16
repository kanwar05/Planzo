import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import ApiError from "../utils/ApiError.js";
import { authenticateAccessToken, requestAccessToken } from "../services/sessionAuthenticationService.js";
import { authorizeConversationAccess, getConversation, sendMessage, markConversationRead } from "../services/messagingService.js";
import { onMessagingEvent } from "../services/messagingEvents.js";
import { consumeMessagingRate } from "../utils/messagingRateLimit.js";

const TYPING_MS = 5000;
const MAX_USER_CONNECTIONS = 10;
const EVENT_NAMES = new Set(["conversation:join", "conversation:leave", "message:send", "conversation:read", "conversation:typing"]);
const cookieMiddleware = cookieParser();
const parseCookies = request => new Promise((resolve, reject) =>
  cookieMiddleware(request, {}, error => error ? reject(error) : resolve()));
const safeError = error => {
  const status = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
  return { success: false, status, message: status === 500 ? "Messaging is temporarily unavailable." :
    status === 401 ? "Please sign in again to continue messaging." :
      status === 403 ? "You cannot access this conversation." : error.message };
};

export function socketClientAddress(request, app) {
  if (!app?.request) return request.socket?.remoteAddress || "unknown";
  // Use Express's compiled trust-proxy chain exactly as HTTP rate limiting
  // does. Reading X-Forwarded-For directly would let clients choose buckets.
  const receiver = Object.assign(Object.create(request), { app });
  return Reflect.get(app.request, "ip", receiver) || request.socket?.remoteAddress || "unknown";
}

// Origin validation covers WebSocket upgrades too; CORS alone protects polling.
// Forwarded TLS is trusted only through the same Express proxy setting as REST.
export function isSocketRequestAllowed(request, { app, origins, production = process.env.NODE_ENV === "production" }) {
  const origin = request.headers?.origin;
  if (origin !== undefined && (typeof origin !== "string" || !origins.includes(origin))) return false;
  const rawCookie = request.headers?.cookie;
  const hasSessionCookie = typeof rawCookie === "string" && /(?:^|;\s*)eventifyy_(?:access|refresh)\s*=/.test(rawCookie);
  if (hasSessionCookie && !origin) return false;
  if (!production) return true;
  if (request.socket?.encrypted) return true;
  const trust = app?.get("trust proxy fn");
  const forwarded = request.headers?.["x-forwarded-proto"];
  return Boolean(typeof trust === "function" && trust(request.socket?.remoteAddress, 0) &&
    typeof forwarded === "string" && forwarded.split(",")[0].trim() === "https");
}

function checkedPayload(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key)) ||
      typeof value.bookingId !== "string" || !/^[a-f0-9]{24}$/i.test(value.bookingId))
    throw new ApiError(400, "Provide valid conversation event data.");
  return { ...value, bookingId: value.bookingId.toLowerCase() };
}

export function createMessagingSocketServer(httpServer, { app } = {}) {
  const configured = process.env.CLIENT_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");
  const origins = configured.split(",").map(value => value.trim()).filter(Boolean);
  const production = process.env.NODE_ENV === "production";
  const states = new Set();
  const handshakes = new Map();
  let closed = false;
  const io = new Server(httpServer, {
    path: "/socket.io",
    maxHttpBufferSize: 32768,
    connectTimeout: 10000,
    cors: { origin: origins, credentials: true, methods: ["GET", "POST"] },
    allowRequest(request, callback) {
      const now = Date.now();
      for (const [key, value] of handshakes) if (value.until <= now) handshakes.delete(key);
      const key = socketClientAddress(request, app);
      let entry = handshakes.get(key);
      if (!entry && handshakes.size >= 10000) return callback("Connection unavailable.", false);
      if (!entry) { entry = { count: 0, until: now + 60000 }; handshakes.set(key, entry); }
      entry.count += 1;
      const allowed = !closed && entry.count <= 120 && isSocketRequestAllowed(request, { app, origins, production });
      callback(allowed ? null : "Connection unavailable.", allowed);
    },
  });

  const endSession = (state, error) => {
    if (state.closed) return;
    state.socket.emit("session:invalid", safeError(error));
    state.socket.disconnect(true);
  };
  const authenticateState = async state => {
    const { user } = await authenticateAccessToken(state.token);
    if (!["customer", "vendor"].includes(user.role)) throw new ApiError(403, "Messaging is available to booking participants only.");
    return user;
  };
  const deliver = (state, bookingId, event, payload) => {
    if (state.closed || state.bookingId !== bookingId) return;
    if (state.deliveryPending >= 50) {
      // These are best-effort hints. Periodic history synchronization recovers
      // from MongoDB without retaining an unbounded slow-recipient queue.
      return;
    }
    state.deliveryPending += 1;
    state.delivery = state.delivery.then(async () => {
      if (closed || state.closed || state.bookingId !== bookingId) return;
      let actor;
      try { actor = await authenticateState(state); }
      catch (error) { endSession(state, error); return; }
      try { await authorizeConversationAccess(bookingId, actor); }
      catch { state.bookingId = null; return; }
      if (!closed && !state.closed && state.bookingId === bookingId) state.socket.emit(event, payload);
    }).catch(() => {}).finally(() => { state.deliveryPending -= 1; });
    // Delivery failure cannot roll back a durable message.
  };
  const validPeers = async (bookingId, actorId) => {
    const peers = [];
    for (const candidate of states) {
      if (candidate.closed || candidate.bookingId !== bookingId || candidate.actorId === actorId) continue;
      try {
        const actor = await authenticateState(candidate);
        await authorizeConversationAccess(bookingId, actor);
        if (!candidate.closed && candidate.bookingId === bookingId) peers.push(candidate);
      } catch (error) { endSession(candidate, error); }
    }
    return peers;
  };
  const broadcastPresence = async bookingId => {
    for (const state of states) {
      if (state.closed || state.bookingId !== bookingId) continue;
      const peers = await validPeers(bookingId, state.actorId);
      deliver(state, bookingId, "conversation:presence", {
        bookingId, online: peers.length > 0, peerRole: state.role === "customer" ? "vendor" : "customer",
      });
    }
  };
  const broadcastTyping = async (bookingId, actorId, role) => {
    const peers = await validPeers(bookingId, actorId);
    const now = Date.now();
    const until = Math.max(0, ...[...states].filter(state => !state.closed && state.bookingId === bookingId &&
      state.actorId === actorId).map(state => state.typingUntil || 0));
    const payload = { bookingId, role, isTyping: until > now, expiresAt: new Date(Math.max(now, until)).toISOString() };
    for (const peer of peers) deliver(peer, bookingId, "conversation:typing", payload);
  };

  io.use(async (socket, next) => {
    try {
      await parseCookies(socket.request);
      if (!isSocketRequestAllowed(socket.request, { app, origins, production })) throw new ApiError(403, "Connection unavailable.");
      const fallback = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
      const token = requestAccessToken(socket.request, fallback);
      const { user, payload } = await authenticateAccessToken(token);
      if (!["customer", "vendor"].includes(user.role)) throw new ApiError(403, "Messaging is available to booking participants only.");
      consumeMessagingRate(String(user._id), "sockets");
      if ([...states].filter(state => !state.closed && state.actorId === String(user._id)).length >= MAX_USER_CONNECTIONS)
        throw new ApiError(429, "Too many messaging connections. Close another tab and try again.");
      socket.data.messaging = { socket, token, actorId: String(user._id), role: user.role, bookingId: null,
        closed: false, queue: Promise.resolve(), queued: 0, delivery: Promise.resolve(), deliveryPending: 0, typingUntil: 0 };
      if (Number.isFinite(payload.exp)) socket.data.messaging.expiresAt = payload.exp * 1000;
      // Reserve before next(): parallel authenticated handshakes must contend
      // on the same connection cap, including before the connection event.
      states.add(socket.data.messaging);
      socket.conn.once("close", () => {
        if (!socket.data.messaging.connected) {
          socket.data.messaging.closed = true;
          states.delete(socket.data.messaging);
        }
      });
      next();
    } catch (error) {
      const result = safeError(error);
      const failure = new Error(result.message);
      failure.data = result;
      next(failure);
    }
  });

  io.on("connection", socket => {
    const state = socket.data.messaging;
    state.connected = true;
    if (state.expiresAt) {
      state.expiryTimer = setTimeout(() => endSession(state, new ApiError(401, "Access credential expired.")),
        Math.max(0, Math.min(2147483647, state.expiresAt - Date.now())));
      state.expiryTimer.unref();
    }
    const requireSubscription = bookingId => {
      if (state.bookingId !== bookingId) throw new ApiError(403, "Join this booking conversation before sending events.");
    };
    const handle = (event, fields, handler) => socket.on(event, (input, acknowledgement) => {
      const reply = response => { if (typeof acknowledgement === "function") acknowledgement(response); };
      if (state.queued >= 20) return reply(safeError(new ApiError(429, "Too many pending messaging events.")));
      state.queued += 1;
      state.queue = state.queue.then(async () => {
        if (state.closed || closed) return;
        let actor;
        try { actor = await authenticateState(state); }
        catch (error) { reply(safeError(error)); endSession(state, error); return; }
        try {
          const data = checkedPayload(input, fields);
          reply({ success: true, ...await handler(data, actor) });
        } catch (error) { reply(safeError(error)); }
      }).catch(() => {}).finally(() => { state.queued -= 1; });
    });
    handle("conversation:join", ["bookingId"], async (data, actor) => {
      consumeMessagingRate(state.actorId, "subscribe");
      const result = await getConversation(data.bookingId, actor);
      const previous = state.bookingId;
      clearTimeout(state.typingTimer); state.typingUntil = 0;
      state.bookingId = data.bookingId;
      if (previous && previous !== state.bookingId) {
        void broadcastTyping(previous, state.actorId, state.role).catch(() => {});
        void broadcastPresence(previous).catch(() => {});
      }
      void broadcastPresence(state.bookingId).catch(() => {});
      return result;
    });
    handle("conversation:leave", ["bookingId"], async (data, actor) => {
      consumeMessagingRate(state.actorId, "subscribe");
      requireSubscription(data.bookingId);
      await authorizeConversationAccess(data.bookingId, actor);
      state.bookingId = null; state.typingUntil = 0; clearTimeout(state.typingTimer);
      void broadcastTyping(data.bookingId, state.actorId, state.role).catch(() => {});
      void broadcastPresence(data.bookingId).catch(() => {});
      return {};
    });
    handle("message:send", ["bookingId", "clientMessageId", "body"], async (data, actor) => {
      requireSubscription(data.bookingId);
      return sendMessage(data.bookingId, actor, { clientMessageId: data.clientMessageId, body: data.body });
    });
    handle("conversation:read", ["bookingId", "throughSequence"], async (data, actor) => {
      requireSubscription(data.bookingId);
      return markConversationRead(data.bookingId, actor, data.throughSequence);
    });
    handle("conversation:typing", ["bookingId", "isTyping"], async (data, actor) => {
      consumeMessagingRate(state.actorId, "typing");
      requireSubscription(data.bookingId);
      if (typeof data.isTyping !== "boolean") throw new ApiError(400, "Typing state must be a boolean.");
      await authorizeConversationAccess(data.bookingId, actor, { write: true });
      state.typingUntil = data.isTyping ? Date.now() + TYPING_MS : 0;
      clearTimeout(state.typingTimer);
      if (data.isTyping) {
        state.typingTimer = setTimeout(() => {
          state.typingUntil = 0;
          void broadcastTyping(data.bookingId, state.actorId, state.role).catch(() => {});
        }, TYPING_MS);
        state.typingTimer.unref();
      }
      await broadcastTyping(data.bookingId, state.actorId, state.role);
      return {};
    });
    socket.onAny((event, ...args) => {
      if (EVENT_NAMES.has(event)) return;
      const acknowledgement = args.at(-1);
      if (typeof acknowledgement === "function") acknowledgement(safeError(new ApiError(400, "Unsupported messaging event.")));
    });
    socket.on("disconnect", () => {
      state.closed = true;
      states.delete(state);
      clearTimeout(state.expiryTimer); clearTimeout(state.typingTimer);
      const previous = state.bookingId;
      state.bookingId = null; state.typingUntil = 0;
      if (previous && !closed) {
        void broadcastTyping(previous, state.actorId, state.role).catch(() => {});
        void broadcastPresence(previous).catch(() => {});
      }
    });
  });

  const unsubscribe = onMessagingEvent(event => {
    if (!event || !["message:new", "conversation:read"].includes(event.type)) return;
    const { type, ...payload } = event;
    for (const state of states) deliver(state, String(event.bookingId), type, payload);
  });
  const validation = setInterval(() => {
    for (const state of states) {
      if (state.validating || state.closed) continue;
      state.validating = true;
      void authenticateState(state).then(async actor => {
        if (state.bookingId) await authorizeConversationAccess(state.bookingId, actor);
      }).catch(error => endSession(state, error)).finally(() => { state.validating = false; });
    }
  }, 10000);
  validation.unref();
  const originalClose = io.close.bind(io);
  io.close = callback => {
    if (!closed) {
      closed = true; clearInterval(validation); unsubscribe(); handshakes.clear();
      for (const state of states) { clearTimeout(state.expiryTimer); clearTimeout(state.typingTimer); }
    }
    return originalClose(callback);
  };
  return io;
}
