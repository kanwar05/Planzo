import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const CONFIRMATION = "I_UNDERSTAND_THIS_IS_STAGING";
const loopback = (host) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("invalid_staging_configuration"); }
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol))
    throw new Error("invalid_staging_configuration");
  return url;
}
function bounded(value, fallback, maximum) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > maximum)
    throw new Error("invalid_staging_bounds");
  return Number(value);
}

export function stagingConfiguration(env = process.env, args = []) {
  if (args.some((argument) => argument !== "--load")) throw new Error("invalid_staging_configuration");
  const api = origin(env.STAGING_API_URL);
  if (api.pathname.replace(/\/$/, "") !== "/api") throw new Error("invalid_staging_configuration");
  const local = loopback(api.hostname);
  if (!local && (
    api.protocol !== "https:" || !/(^|[.-])staging([.-]|$)/i.test(api.hostname) ||
    /(^|[.-])(?:prod|production|live)([.-]|$)/i.test(api.hostname) ||
    env.PLANZO_STAGING_CONFIRM !== CONFIRMATION || env.STAGING_ALLOWED_ORIGIN !== api.origin
  )) throw new Error("staging_target_refused");
  let frontend;
  if (env.STAGING_FRONTEND_ORIGIN) {
    frontend = origin(env.STAGING_FRONTEND_ORIGIN);
    if (frontend.pathname !== "/" || (!local && frontend.protocol !== "https:"))
      throw new Error("invalid_staging_configuration");
  } else if (!local) throw new Error("invalid_staging_configuration");
  return {
    api: api.toString().replace(/\/$/, ""), frontendOrigin: frontend?.origin,
    load: args.includes("--load"),
    requests: bounded(env.STAGING_REQUESTS, 20, 200),
    concurrency: bounded(env.STAGING_CONCURRENCY, 4, 10),
    timeoutMs: bounded(env.STAGING_TIMEOUT_MS, 3000, 10000),
    durationMs: bounded(env.STAGING_DURATION_MS, 15000, 30000),
  };
}

const PRIVATE_FIELDS = new Set([
  "email", "phone", "password", "authVersion", "userId", "contactDetails",
  "profileRevision", "bookingRevision", "bookingGuardRevision", "suspensionReason",
  "verificationRejectionReason", "passwordResetTokenHash", "tokenHash",
]);
function publicOnly(value) {
  if (!value || typeof value !== "object") return true;
  return Object.entries(value).every(([key, nested]) => !PRIVATE_FIELDS.has(key) && publicOnly(nested));
}
async function smallJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("invalid_response");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) throw new Error("response_limit_exceeded");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function verifyStaging(config, { fetcher = fetch } = {}) {
  const checks = [];
  const latencies = [];
  const statusCounts = {};
  const deadline = AbortSignal.timeout(config.durationMs);
  async function request(suffix, { headers } = {}) {
    const began = performance.now();
    const response = await fetcher(`${config.api}${suffix}`, {
      method: "GET", redirect: "error", credentials: "omit", headers,
      signal: AbortSignal.any([deadline, AbortSignal.timeout(config.timeoutMs)]),
    });
    latencies.push(performance.now() - began);
    statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
    return response;
  }
  async function check(name, operation) {
    try { await operation(); checks.push({ name, status: "pass" }); }
    catch { checks.push({ name, status: "fail" }); }
  }
  await check("liveness_and_security_headers", async () => {
    const response = await request("/health");
    if (response.status !== 200 || response.headers.get("x-content-type-options") !== "nosniff" ||
        !(await smallJson(response)).success) throw new Error("probe_failed");
  });
  await check("readiness", async () => {
    const response = await request("/ready");
    if (response.status !== 200 || !(await smallJson(response)).success) throw new Error("probe_failed");
  });
  await check("public_listing_privacy", async () => {
    const response = await request("/vendors?limit=1");
    const data = await smallJson(response);
    if (response.status !== 200 || !Array.isArray(data.vendors) || !publicOnly(data.vendors) ||
        data.vendors.some((vendor) => vendor.verificationStatus !== "approved")) throw new Error("probe_failed");
  });
  await check("unauthenticated_booking_access", async () => {
    const response = await request("/bookings/my-bookings");
    const data = await smallJson(response);
    if (response.status !== 401 || data.stack !== undefined || data.success !== false)
      throw new Error("probe_failed");
  });
  if (config.frontendOrigin) await check("configured_frontend_cors", async () => {
    const response = await request("/health", { headers: { Origin: config.frontendOrigin } });
    if (response.status !== 200 || response.headers.get("access-control-allow-origin") !== config.frontendOrigin ||
        response.headers.get("access-control-allow-credentials") !== "true") throw new Error("probe_failed");
    await smallJson(response);
  });
  await check("untrusted_origin_rejected", async () => {
    const response = await request("/health", { headers: { Origin: "https://untrusted.invalid" } });
    if (response.status !== 403) throw new Error("probe_failed");
    await smallJson(response);
  });
  if (config.load && checks.every((result) => result.status === "pass")) {
    let next = 0;
    await check("bounded_read_load", async () => {
      let failures = 0;
      await Promise.all(Array.from({ length: config.concurrency }, async () => {
        while (next < config.requests && !deadline.aborted) {
          next += 1;
          try {
            const response = await request("/vendors?limit=1");
            if (response.status !== 200) failures += 1;
            await smallJson(response);
          } catch { failures += 1; }
        }
      }));
      if (failures || next !== config.requests) throw new Error("load_check_failed");
    });
  }
  latencies.sort((a, b) => a - b);
  return {
    event: "staging_verification", mode: config.load ? "smoke_and_bounded_reads" : "smoke",
    success: checks.every((result) => result.status === "pass"), checks,
    requestCount: latencies.length, statusCounts,
    latencyMs: { p50: Math.round(latencies[Math.floor(latencies.length * 0.5)] || 0), p95: Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] || 0) },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyStaging(stagingConfiguration(process.env, process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (!result.success) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ event: "staging_verification", success: false, error: "configuration_or_probe_failed" }));
    process.exitCode = 1;
  }
}
