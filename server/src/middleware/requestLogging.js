import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { logEvent, requestContext } from "../utils/logger.js";

export function requestLogging(req, res, next) {
  // Generate locally: an untrusted request header cannot forge another request's ID.
  req.requestId = randomUUID();
  res.set("X-Request-Id", req.requestId);
  const started = performance.now();
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    if (process.env.NODE_ENV === "test") return;
    const durationMs = Math.round(performance.now() - started);
    const configured = req.route?.path;
    const route = Array.isArray(configured) && configured.includes(req.path) ? req.path : configured;
    if (["/", "/api/health", "/api/health/live", "/api/ready"].includes(route) && res.statusCode < 400) return;
    logEvent(res.statusCode >= 500 ? "error" : durationMs >= Number(process.env.SLOW_REQUEST_MS || 1000) ? "warn" : "info", "http_request", {
      requestId: req.requestId,
      method: req.method,
      route: typeof route === "string" ? `${req.baseUrl || ""}${route}` : "unmatched",
      statusCode: res.writableEnded ? res.statusCode : 499,
      durationMs,
    });
  };
  res.once("finish", record);
  res.once("close", record);
  requestContext.run({ requestId: req.requestId }, next);
}
