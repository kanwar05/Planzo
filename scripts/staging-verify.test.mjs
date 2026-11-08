import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { stagingConfiguration, verifyStaging } from "./staging-verify.mjs";

test("staging target guards reject production, credentials, unconfirmed hosts and unbounded load", () => {
  for (const env of [
    { STAGING_API_URL: "https://api.example.com/api" },
    { STAGING_API_URL: "https://staging-api.example.com/api" },
    { STAGING_API_URL: "https://user:secret@staging-api.example.com/api" },
    { STAGING_API_URL: "http://localhost:5001/api", STAGING_REQUESTS: "201" },
    { STAGING_API_URL: "http://localhost:5001/api", STAGING_CONCURRENCY: "11" },
    { STAGING_API_URL: "http://localhost:5001/api", STAGING_DURATION_MS: "30001" },
  ]) assert.throws(() => stagingConfiguration(env, ["--load"]));
  const env = {
    STAGING_API_URL: "https://staging-api.example.invalid/api", STAGING_ALLOWED_ORIGIN: "https://staging-api.example.invalid",
    PLANZO_STAGING_CONFIRM: "I_UNDERSTAND_THIS_IS_STAGING", STAGING_FRONTEND_ORIGIN: "https://staging.example.invalid",
  };
  assert.equal(stagingConfiguration(env).api, env.STAGING_API_URL);
  assert.throws(() => stagingConfiguration({ ...env, STAGING_API_URL: "https://production-staging.example.invalid/api", STAGING_ALLOWED_ORIGIN: "https://production-staging.example.invalid" }));
});

test("smoke and bounded load use GET only, enforce concurrency and return no response PII", async () => {
  const methods = [];
  let active = 0;
  let maximum = 0;
  let leak = false;
  const server = createServer(async (req, res) => {
    methods.push(req.method);
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise(setImmediate);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let status = 200;
    let body = { success: true };
    if (req.headers.origin === "https://untrusted.invalid") { status = 403; body = { success: false }; }
    else if (req.url.startsWith("/api/bookings")) { status = 401; body = { success: false }; }
    else if (req.url.startsWith("/api/vendors")) body = { vendors: [{ verificationStatus: "approved", ...(leak ? { email: "private@example.invalid" } : {}) }] };
    res.writeHead(status);
    res.end(JSON.stringify(body));
    active -= 1;
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const config = stagingConfiguration({
      STAGING_API_URL: `http://127.0.0.1:${server.address().port}/api`, STAGING_REQUESTS: "8", STAGING_CONCURRENCY: "2",
    }, ["--load"]);
    const result = await verifyStaging(config);
    assert.equal(result.success, true, JSON.stringify(result.checks));
    assert.equal(result.requestCount, 13);
    assert.ok(maximum <= 2);
    assert.ok(methods.every((method) => method === "GET"));
    assert.doesNotMatch(JSON.stringify(result), /private@|127.0.0.1|vendors/);
    leak = true;
    const failed = await verifyStaging({ ...config, load: false });
    assert.equal(failed.success, false);
    assert.equal(failed.checks.find((check) => check.name === "public_listing_privacy").status, "fail");
    assert.doesNotMatch(JSON.stringify(failed), /private@example/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("staging probes never follow a redirect to another deployment", async () => {
  const redirects = [];
  const config = stagingConfiguration({ STAGING_API_URL: "http://localhost:5001/api" });
  const result = await verifyStaging(config, { fetcher: async (url, options) => {
    redirects.push(options.redirect);
    throw new Error("redirect refused");
  } });
  assert.equal(result.success, false);
  assert.ok(redirects.every((mode) => mode === "error"));
});
