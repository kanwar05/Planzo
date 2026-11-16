import { logEvent } from "../utils/logger.js";

// Transport-independent committed-change hints. MongoDB remains authoritative;
// listeners must authorize each recipient and clients recover missed hints via REST.
const listeners = new Set();
export function onMessagingEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function publishMessagingEvent(event) {
  for (const listener of listeners)
    Promise.resolve().then(() => listener(event)).catch(() => logEvent("warn", "messaging_realtime_hint_failed"));
}
