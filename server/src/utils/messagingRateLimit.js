import ApiError from "./ApiError.js";

const policies = {
  send: [30, 60_000], read: [120, 60_000], subscribe: [30, 60_000],
  typing: [20, 10_000], sockets: [60, 60_000],
};
const entries = new Map();
const MAX_ENTRIES = 10000;
export function consumeMessagingRate(actorId, kind) {
  const policy = policies[kind === "socket" ? "sockets" : kind];
  if (!policy) throw new Error("Unknown messaging rate policy.");
  const now = Date.now();
  for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key);
  const key = `${actorId}:${kind === "socket" ? "sockets" : kind}`;
  let entry = entries.get(key);
  if (!entry) {
    if (entries.size >= MAX_ENTRIES) throw new ApiError(429, "Messaging is busy. Please try again shortly.");
    entry = { count: 0, expiresAt: now + policy[1] };
    entries.set(key, entry);
  }
  if (++entry.count > policy[0]) throw new ApiError(429, "Too many messaging requests. Please try again shortly.");
}
export function resetMessagingRateLimitsForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Messaging rate reset is test-only.");
  entries.clear();
}
