import { io } from "socket.io-client";
import { api } from "./api";

export function createConversationConnection({ bookingId, onMessage, onRead, onPresence, onTyping, onState, onResync }) {
  const endpoint = new URL(api.defaults.baseURL, window.location.origin);
  const socket = io(endpoint.origin, { path: "/socket.io", withCredentials: true, autoConnect: false,
    reconnectionDelay: 1000, reconnectionDelayMax: 10000, timeout: 10000 });
  let stopped = false, refreshing = false, refreshAttempts = 0, timer, joinTimer;
  const scoped = handler => data => { if (!stopped && data?.bookingId === bookingId) handler?.(data); };
  const refreshSession = async () => {
    if (stopped || refreshing) return;
    if (refreshAttempts >= 3) { socket.disconnect(); onState?.("unavailable"); return; }
    refreshing = true; refreshAttempts += 1;
    onState?.("reconnecting");
    try {
      await api.get("/auth/me"); // Existing interceptor rotates HttpOnly refresh credentials.
      if (!stopped) { socket.disconnect(); socket.connect(); }
    } catch {
      if (!stopped) { socket.disconnect(); onState?.("unavailable"); }
    } finally { refreshing = false; }
  };
  socket.on("connect", () => {
    if (stopped) return;
    clearTimeout(timer); clearTimeout(joinTimer);
    let joined = false;
    joinTimer = setTimeout(() => {
      if (!stopped && !joined) { socket.disconnect(); onState?.("unavailable"); }
    }, 10000);
    socket.emit("conversation:join", { bookingId }, response => {
      if (stopped || !socket.connected) return;
      joined = true; clearTimeout(joinTimer);
      if (!response?.success) {
        if (response?.status === 401) refreshSession();
        else { socket.disconnect(); onState?.("unavailable"); }
        return;
      }
      refreshAttempts = 0; onState?.("connected"); onResync?.();
    });
  });
  socket.on("connect_error", error => {
    if (stopped) return;
    const status = error?.data?.status || error?.data?.statusCode;
    if (status === 401) refreshSession();
    else if (status === 403) { socket.disconnect(); onState?.("unavailable"); }
    else onState?.("reconnecting");
  });
  socket.on("disconnect", reason => {
    if (stopped) return;
    onPresence?.({ bookingId, online: null }); onTyping?.({ bookingId, isTyping: false });
    onState?.("reconnecting");
    if (reason === "io server disconnect") {
      clearTimeout(timer); timer = setTimeout(refreshSession, 1000);
    }
  });
  socket.on("message:new", scoped(onMessage));
  socket.on("conversation:read", scoped(onRead));
  socket.on("conversation:presence", scoped(onPresence));
  socket.on("conversation:typing", scoped(onTyping));
  socket.on("session:invalid", () => { if (!stopped) refreshSession(); });
  socket.on("session:expired", () => { if (!stopped) refreshSession(); });
  onState?.("connecting"); socket.connect();
  return {
    typing(isTyping) {
      // Ephemeral typing must never enter Socket.IO's disconnected send buffer.
      if (!stopped && socket.connected) socket.volatile.emit("conversation:typing", { bookingId, isTyping });
    },
    close() {
      stopped = true; clearTimeout(timer); clearTimeout(joinTimer);
      if (socket.connected) socket.emit("conversation:leave", { bookingId });
      socket.removeAllListeners(); socket.disconnect();
    },
  };
}
