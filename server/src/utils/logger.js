import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const numbers = new Set(["statusCode", "durationMs", "attempts", "claimed", "sent", "failed", "stale", "port"]);
const tokens = new Set(["category", "phase", "method"]);

// Callers supply fixed event/category tokens, never exception messages. Drop
// arbitrary objects and fields rather than trying to redact known secret names.
export function logEvent(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    event: /^[a-z][a-z0-9_]{0,79}$/.test(event) ? event : "application_event",
  };
  const requestId = fields.requestId || requestContext.getStore()?.requestId;
  if (uuid.test(requestId || "")) entry.requestId = requestId;
  for (const [key, value] of Object.entries(fields)) {
    if (numbers.has(key) && Number.isFinite(value) && value >= 0) entry[key] = value;
    if (tokens.has(key) && typeof value === "string" && /^[a-zA-Z0-9_:.-]{1,80}$/.test(value)) entry[key] = value;
    if (key === "ready" && typeof value === "boolean") entry.ready = value;
    // Route templates come from Express configuration, never originalUrl/path.
    if (key === "route" && typeof value === "string" && /^[a-zA-Z0-9_/:.*-]{1,160}$/.test(value)) entry.route = value;
  }
  console[entry.level === "info" ? "log" : entry.level](JSON.stringify(entry));
}

export function errorCategory(error) {
  if (error?.code === 11000) return "duplicate_key";
  try {
    if (typeof error?.hasErrorLabel === "function") {
      if (error.hasErrorLabel("UnknownTransactionCommitResult")) return "transaction_commit_unknown";
      if (error.hasErrorLabel("TransientTransactionError")) return "transaction_transient";
    }
  } catch { /* Reporting an error must not throw another provider error. */ }
  if (["MongoNetworkError", "MongoServerSelectionError", "MongoNetworkTimeoutError", "MongoOperationTimeoutError"].includes(error?.name)) return "database_unavailable";
  if (error?.name === "ValidationError" || error?.name === "CastError") return "validation";
  return "operation_failed";
}
