const prefix = "planzo:message-intent:";
const keyFor = (userId, bookingId) => `${prefix}${userId}:${bookingId}`;

// Only an unresolved send is retained, in this tab's session and user namespace.
// Persisted conversation history always comes from the authorized server.
export function readMessageIntent(userId, bookingId) {
  if (!userId || !bookingId) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(keyFor(userId, bookingId)) || "null");
    return value && typeof value.body === "string" && value.body.length <= 4000 &&
      typeof value.clientMessageId === "string" && /^[A-Za-z0-9._:-]{16,128}$/.test(value.clientMessageId)
      ? { body: value.body, clientMessageId: value.clientMessageId } : null;
  } catch { return null; }
}

export function storeMessageIntent(userId, bookingId, value) {
  if (!userId || !bookingId) return;
  try { sessionStorage.setItem(keyFor(userId, bookingId), JSON.stringify(value)); }
  catch { /* Sending remains retry-safe while the page is mounted without storage. */ }
}

export function clearMessageIntent(userId, bookingId) {
  try { sessionStorage.removeItem(keyFor(userId, bookingId)); } catch { /* Storage may be disabled. */ }
}

export function retainMessageIntents(userId) {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(prefix) && (!userId || !key.startsWith(`${prefix}${userId}:`))) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be disabled. */ }
}
