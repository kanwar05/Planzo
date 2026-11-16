// Browser UI checks. All API responses use test fixtures; no live accounts or mutations.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(frontend, "dist");
const cache = path.join(frontend, ".cache", "redesign");
fs.mkdirSync(cache, { recursive: true });
const origin = "http://127.0.0.1:4174";
const blockAnimations = process.env.QA_BLOCK_ANIMATIONS === "1";
const browserPath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
  let filename = path.resolve(dist, "." + pathname);
  if (!filename.startsWith(dist + path.sep) && filename !== dist) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(filename).pipe(res);
});
await new Promise(resolve => server.listen(4174, "127.0.0.1", resolve));
const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9336", "--user-data-dir=" + path.join(cache, "chrome-ui-check")], { stdio: "ignore", windowsHide: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
for (let i = 0; i < 20; i++) {
  if (browser.exitCode !== null) throw new Error("Chrome exited before debugger startup: " + browser.exitCode);
  try { target = await (await fetch("http://127.0.0.1:9336/json/new?about:blank", { method: "PUT", signal: AbortSignal.timeout(750) })).json(); break; } catch { await delay(250); }
}
if (!target) { browser.kill(); server.close(); throw new Error("Chrome debugging endpoint did not start."); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; setTimeout(() => reject(new Error("Chrome WebSocket connection timed out")), 5000).unref(); });
let counter = 0, role = null;
const pending = new Map(), errors = [], requests = [];
function send(method, params = {}) {
  const id = ++counter;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const photo = origin + "/assets/" + fs.readdirSync(path.join(dist, "assets")).find(name => /^venue-.*\.(webp|jpg)$/.test(name));
const vendor = { _id: "vendor-1", businessName: "Celebration Studio", serviceCategory: "Decoration", description: "Thoughtful celebration styling and event decoration for your special day.", pricing: 15000, location: "Chandigarh", servicesOffered: ["Floral decoration", "Wedding styling"], verificationStatus: "approved", verified: true, portfolioImages: [{ url: photo }, { url: photo + "?second=1" }] };
const owner = { ...vendor, contactDetails: { phone: "+919876543210", email: "studio@example.test" } };
const event = { eventDate: "2027-02-01", eventType: "Wedding", eventLocation: "Garden Venue, Chandigarh", description: "Decorate our garden wedding with seasonal flowers.", notes: "Please bring a stage backdrop.", customerId: { _id: "customer-1", name: "Aditi Customer" }, vendorId: vendor };
const bookings = [{ ...event, _id: "booking-pending", status: "pending" }, { ...event, _id: "booking-accepted", status: "accepted", vendorId: owner }, { ...event, _id: "booking-completed", status: "completed", vendorId: owner }];
const dates = { availability: { availableDates: [], unavailableDates: ["2027-02-02"], bookedDates: ["2027-02-03"] } };
const pageInfo = { page: 1, pages: 1, total: 1, hasNextPage: false };
const messageBookingId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const closedMessageBookingId = "dddddddddddddddddddddddd";
const messagePath = `/bookings/${messageBookingId}/messages`;
const closedMessagePath = `/bookings/${closedMessageBookingId}/messages`;
const quotation = {
  _id: "ffffffffffffffffffffffff", revision: 1, serviceDescription: "Seasonal garden wedding decoration",
  serviceDate: event.eventDate, currency: "INR", items: [{ description: "Floral styling and stage setup", quantity: 1, unitPriceAmount: 1500000 }],
  additionalCharges: [], discountAmount: 0, subtotalAmount: 1500000, totalAmount: 1500000,
  deliverables: ["Seasonal flowers and a stage backdrop"], exclusions: ["Venue rental"],
  terms: "The venue will provide access for setup.", expiresAt: "2027-01-15T12:00:00.000Z",
};
const conversationMessages = [
  { _id: "111111111111111111111111", sequence: 1, senderRole: "customer", clientMessageId: "browser-customer-message-1", body: "Could we include seasonal flowers and confirm the setup time?", createdAt: "2026-11-16T03:00:00.000Z" },
  { _id: "222222222222222222222222", sequence: 2, senderRole: "vendor", clientMessageId: "browser-vendor-message-2", body: "Seasonal flowers are included. We will coordinate access with the venue before setup.", createdAt: "2026-11-16T03:01:00.000Z" },
];
function conversationFixture(bookingId) {
  const closed = bookingId === closedMessageBookingId;
  const selfRole = role === "vendor" ? "vendor" : "customer";
  return {
    booking: { ...event, _id: bookingId, eventDate: closed ? "2026-11-15" : event.eventDate, status: closed ? "completed" : "pending", quotationRevision: 1, quotationStatus: closed ? "accepted" : "offered",
      ...(closed ? { acceptedAgreement: { ...quotation, serviceDate: "2026-11-15", expiresAt: "2026-11-15T00:00:00.000Z", quotationId: quotation._id, acceptedAt: "2026-11-14T03:02:00.000Z" } } : {}) },
    conversation: { _id: closed ? "eeeeeeeeeeeeeeeeeeeeeeee" : "cccccccccccccccccccccccc", bookingId, lastSequence: 2, selfReadSequence: 2, peerReadSequence: 2, unreadCount: 0,
      readAt: "2026-11-16T03:03:00.000Z", peerReadAt: "2026-11-16T03:03:00.000Z", canSend: !closed, selfRole,
      peer: { name: selfRole === "vendor" ? "Aditi Customer" : vendor.businessName, role: selfRole === "vendor" ? "customer" : "vendor" } },
  };
}
function fixture(url, method) {
  const parsed = new URL(url);
  const p = parsed.pathname.replace(/^.*\/api/, "");
  // Exercise durable REST fallback; no browser request reaches a live socket server.
  if (parsed.pathname.startsWith("/socket.io")) return method === "OPTIONS" ? [204, {}] : [503, { message: "Live updates are unavailable in this isolated browser fixture." }];
  const conversationMatch = p.match(/^\/bookings\/([bd]{24})\/(conversation(?:\/read)?|messages|quotations)$/);
  if (conversationMatch) {
    const [, bookingId, resource] = conversationMatch;
    const details = conversationFixture(bookingId);
    if (resource === "conversation" && method === "GET") return [200, details];
    if (resource === "conversation/read" && method === "PATCH") return [200, { conversation: details.conversation }];
    if (resource === "messages" && method === "GET") {
      const after = Number(parsed.searchParams.get("after") || 0);
      const before = Number(parsed.searchParams.get("before") || Number.MAX_SAFE_INTEGER);
      const messages = conversationMessages.filter(item => item.sequence > after && item.sequence < before).map(item => ({ ...item, bookingId, conversationId: details.conversation._id }));
      return [200, { conversation: details.conversation, messages, pagination: { hasMore: false, nextBefore: null, nextAfter: messages.at(-1)?.sequence || after } }];
    }
    if (resource === "quotations" && method === "GET") return [200, { quotations: [{ ...quotation, bookingId }] }];
  }
  if (p === "/conversations/unread" && method === "GET") return [200, { unreadCounts: {}, totalUnread: 0 }];
  if (p === "/auth/me") return role ? [200, { user: { _id: role + "-1", name: "Planzo " + role, email: role + "@example.test", phone: "9999999991", role, emailVerified: true } }] : [401, { message: "Please log in." }];
  if (p === "/auth/refresh") return [401, { message: "Please log in." }];
  if (p === "/vendors") return [200, { vendors: [vendor], pagination: pageInfo }];
  if (p === "/vendors/packages/mine" || /^\/vendors\/[^/]+\/packages$/.test(p)) return [200, { packages: [] }];
  if (p === "/vendors/me") return [200, { vendor: owner }];
  if (p.endsWith("/availability")) return [200, dates];
  if (p === "/vendors/vendor-1") return [200, { vendor }];
  if (p === "/bookings/my-bookings" || p === "/bookings/vendor-requests") return [200, { bookings }];
  if (p === "/admin/stats") return [200, { stats: { totalCustomers: 3, totalVendors: 2, totalBookings: 3, pendingBookings: 1, acceptedBookings: 1, completedBookings: 1, pendingVendors: 1 } }];
  if (p === "/admin/users") return [200, { users: [{ _id: "customer-1", name: "Aditi Customer", email: "customer@example.test", role: "customer", accountStatus: "active", suspendedAt: null }], pagination: pageInfo }];
  if (p === "/admin/vendors") return [200, { vendors: [{ ...owner, verificationStatus: "pending", userId: { name: "Vendor Owner", email: "owner@example.test" } }], pagination: pageInfo }];
  if (p === "/admin/bookings") return [200, { bookings, pagination: { ...pageInfo, total: 3 } }];
  if (method === "OPTIONS") return [204, {}];
  return [404, { message: "No browser fixture for " + method + " " + p }];
}
ws.onmessage = async event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    if (item) { pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    return;
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === "Fetch.requestPaused") {
    const { requestId, request, resourceType } = message.params;
    const local = request.url.startsWith(origin + "/");
    if (blockAnimations && /\/motionFeatures-[^/]+\.js/.test(request.url)) {
      await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    } else if (["XHR", "Fetch"].includes(resourceType) || !local && request.url.includes("/api")) {
      const [status, data] = fixture(request.url, request.method);
      requests.push({ method: request.method, url: request.url, status });
      await send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: origin }, { name: "Access-Control-Allow-Credentials", value: "true" }, { name: "Access-Control-Allow-Headers", value: "Content-Type" }, { name: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,PUT,DELETE,OPTIONS" }], body: status === 204 ? "" : Buffer.from(JSON.stringify({ success: status < 400, ...data })).toString("base64") });
    } else if (!local) {
      await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    } else await send("Fetch.continueRequest", { requestId });
  }
};
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
const defaultScenarios = [
  [null, "/", "Every celebration"], [null, "/services", "The right people"], [null, "/vendors?category=Decoration", "Find your kind"], [null, "/vendors/vendor-1", "Celebration Studio"],
  ["customer", "/booking/vendor-1", "Your celebration starts here"], ["customer", "/customer/dashboard", "My bookings"], ["customer", "/settings", "Account settings"],
  ["vendor", "/vendor/dashboard", "Booking requests"], ["vendor", "/vendor/profile-setup", "Manage business profile"], ["vendor", "/vendor/availability", "Date availability"],
  ["admin", "/admin", "Platform overview"], ["admin", "/admin/users", "Registered users"], ["admin", "/admin/vendors/unverified", "Vendor approvals"], ["admin", "/admin/bookings", "All bookings"],
  [null, "/login", "Welcome back"], [null, "/register?role=vendor", "Create your account"], [null, "/forgot-password", "Reset your password"], [null, "/reset-password", "Secure your account"], [null, "/not-a-page", "This party"],
];
// QA_SCENARIOS=messaging keeps the default smoke suite unchanged while allowing
// focused customer/vendor and closed-history layout checks at chosen widths.
const scenarios = process.env.QA_SCENARIOS === "messaging" ? [
  ["customer", messagePath, "Messages with Celebration Studio"],
  ["vendor", messagePath, "Messages with Aditi Customer"],
  ["customer", closedMessagePath, "Messages with Celebration Studio"],
] : defaultScenarios;
const results = [], navigation = [];
const evaluate = async expression => {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
};
const key = async value => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: value, code: value });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: value, code: value });
};
const widths = (process.env.QA_WIDTHS || "320,360,375,390,430,768,1024,1440").split(",").map(Number);
try {
  for (const width of widths) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 844 : 1000, deviceScaleFactor: 1, mobile: width < 768 });
    for (const [nextRole, pathname, heading] of scenarios) {
      role = nextRole;
      await send("Page.navigate", { url: origin + pathname });
      let snapshot;
      for (let i = 0; i < 80; i++) {
        await delay(100);
        snapshot = await evaluate("({ready:document.readyState,text:document.body.innerText.replace(/\\s+/g,' '),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href'))})");
        if (snapshot?.ready === "complete" && snapshot.text.includes(heading)) break;
      }
      await evaluate("document.fonts.ready.then(()=>true)");
      await delay(150);
      if (pathname.startsWith("/bookings/")) {
        await evaluate("document.querySelector('details > summary')?.click()");
        await delay(100);
        const messagingState = await evaluate(`(() => {
          const log = document.querySelector('[role="log"]');
          const own = document.querySelector('[aria-label="Your message ${role === "vendor" ? 2 : 1}"]');
          return { history: !!log?.innerText.includes('Seasonal flowers are included') && !!log?.innerText.includes('Could we include seasonal flowers'),
            timestamp: !!log?.querySelector('time[datetime="2026-11-16T03:00:00.000Z"]') && !!log?.innerText.includes('UTC'),
            receipt: !!own?.innerText.includes('Read'), summary: document.body.innerText.includes('Garden Venue, Chandigarh') && document.body.innerText.includes('Seasonal garden wedding decoration'),
            composer: !!document.querySelector('textarea'), liveNotClaimed: !document.body.innerText.includes('Live updates connected') };
        })()`);
        navigation.push({ width, action: `${role} persisted message history and REST fallback`, ok: messagingState.history && messagingState.timestamp && messagingState.receipt && messagingState.summary && messagingState.liveNotClaimed && messagingState.composer === (pathname !== closedMessagePath), details: messagingState });
      }
      snapshot = await evaluate("({text:document.body.innerText.replace(/\\s+/g,' '),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),headings:document.querySelectorAll('h1').length})");
      const overflow = snapshot.scrollWidth > width + 1;
      const offenders = overflow ? await evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && !e.closest('[class*=overflow-x-auto]')).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.innerText?.slice(0,70),right:e.getBoundingClientRect().right}))") : [];
      const result = { width, role, pathname, heading: snapshot.text.includes(heading), overflow, scrollWidth: snapshot.scrollWidth, headings: snapshot.headings, deadLinks: snapshot.links.filter(href => !href || href === "#"), offenders };
      results.push(result);
      if (!blockAnimations && [320,390,1440].includes(width) && (["/", "/vendors?category=Decoration", "/vendors/vendor-1", "/booking/vendor-1", "/customer/dashboard", "/vendor/profile-setup", "/admin", "/login"].includes(pathname) || pathname.startsWith("/bookings/"))) {
        await delay(500);
        const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        fs.writeFileSync(path.join(cache, "after-" + (pathname.startsWith("/bookings/") ? role + "-" : "") + pathname.replace(/[^a-z0-9]/gi, "-") + "-" + width + ".png"), Buffer.from(shot.data, "base64"));
      }
      process.stdout.write(JSON.stringify(result) + "\n");
      if (pathname.startsWith("/vendors?") && width < 1024) {
        await evaluate("document.querySelector('button[aria-haspopup=dialog]').focus();document.querySelector('button[aria-haspopup=dialog]').click()");
        await delay(300);
        navigation.push({ width, action: "Filter sheet focus", ok: await evaluate("!!document.querySelector('[role=dialog]')?.contains(document.activeElement)") });
        await key("Escape"); await delay(300);
        navigation.push({ width, action: "Filter Escape restores focus", ok: await evaluate("!document.querySelector('[role=dialog]') && document.activeElement.matches('button[aria-haspopup=dialog]') && document.body.style.overflow !== 'hidden'") });
      }
      if (pathname === "/vendors/vendor-1") {
        if (width < 768) navigation.push({ width, action: "Booking CTA above bottom navigation", ok: await evaluate("(()=>{const nav=document.querySelector('nav[aria-label=\"Customer navigation\"]');const cta=[...document.querySelectorAll('a')].filter(a=>a.getAttribute('href')==='/booking/vendor-1').find(a=>a.getBoundingClientRect().height>0);return cta.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top+1})()") });
        await evaluate("document.querySelector('[aria-label=\"Preview business photo 1\"]').focus();document.querySelector('[aria-label=\"Preview business photo 1\"]').click()");await delay(300);
        await key("ArrowRight");await delay(150);
        navigation.push({ width, action: "Gallery arrow key", ok: await evaluate("document.querySelector('[role=dialog]').innerText.includes('Photo 2 of 2')") });
        await key("Escape");await delay(300);
        navigation.push({ width, action: "Gallery closes and restores focus", ok: await evaluate("!document.querySelector('[role=dialog]') && document.activeElement.getAttribute('aria-label')==='Preview business photo 1'") });
      }
      if (["/customer/dashboard", "/vendor/dashboard", "/admin"].includes(pathname)) {
        if (width < 1024) {
          await evaluate("document.querySelector('[aria-label=\"Open sidebar\"]').click()");await delay(100);
          navigation.push({ width, action: role + " sidebar opens", ok: await evaluate("Math.abs(document.querySelector('aside[role=dialog]').getBoundingClientRect().left)<2") });
        }
        await evaluate("[...document.querySelectorAll('aside nav a')].find(a=>a.innerText.trim()==='My account' && a.getBoundingClientRect().width>0)?.click()");await delay(300);
        navigation.push({ width, action: role + " account link", ok: await evaluate("document.body.innerText.includes('Account settings')") });
      }
    }
  }
  const report = { results, navigation, errors, unexpectedRequests: requests.filter(item => item.status === 404), apiRequestsIntercepted: requests.length, note: "Chrome responsive emulation with isolated API fixtures, not real-account integration or native iOS testing." };
  report.blockedAnimationChunk = blockAnimations;
  report.scenarioGroup = process.env.QA_SCENARIOS || "default";
  fs.writeFileSync(path.join(cache, blockAnimations ? "browser-no-animation-results.json" : "browser-smoke-results.json"), JSON.stringify(report, null, 2));
  const failures = results.filter(item => !item.heading || item.overflow || item.deadLinks.length || item.headings !== 1);
  const navigationFailures = navigation.filter(item => !item.ok);
  console.log("SUMMARY", JSON.stringify({ pages: results.length, failures, navigationChecks: navigation.length, navigationFailures, pageErrors: errors, unexpectedRequests: report.unexpectedRequests.length }));
  if (failures.length || navigationFailures.length || errors.length || report.unexpectedRequests.length) process.exitCode = 1;
} finally {
  await send("Browser.close").catch(() => {});
  ws.close(); browser.kill(); server.close();
}
