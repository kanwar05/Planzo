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
function fixture(url, method) {
  const p = new URL(url).pathname.replace(/^.*\/api/, "");
  if (p === "/auth/me") return role ? [200, { user: { _id: role + "-1", name: "Planzo " + role, email: role + "@example.test", phone: "9999999991", role } }] : [401, { message: "Please log in." }];
  if (p === "/auth/refresh") return [401, { message: "Please log in." }];
  if (p === "/vendors") return [200, { vendors: [vendor], pagination: pageInfo }];
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
    if (["XHR", "Fetch"].includes(resourceType) || !local && request.url.includes("/api")) {
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
await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
await send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: "cellular4g" });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__uiPerf = { lcp: null, lcpElement: null, cls: 0, interactions: {} };
  new PerformanceObserver(list => { for (const entry of list.getEntries()) {
    window.__uiPerf.lcp = entry.startTime;
    window.__uiPerf.lcpElement = {tag:entry.element?.tagName, text:entry.element?.textContent?.slice(0,100), url:entry.url};
  } }).observe({type:'largest-contentful-paint',buffered:true});
  new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__uiPerf.cls += entry.value; }).observe({type:'layout-shift',buffered:true});
  new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.interactionId) window.__uiPerf.interactions[entry.interactionId] = Math.max(window.__uiPerf.interactions[entry.interactionId] || 0,entry.duration); }).observe({type:'event',buffered:true,durationThreshold:16});
` });
const evaluate=async expression=>(await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true})).result.value;
const runs=[];
try {
  for(let index=0;index<3;index++) {
    await send("Network.clearBrowserCache");
    await send("Page.navigate",{url:origin+"/"});
    for(let i=0;i<100;i++){await delay(100);if(await evaluate("document.readyState==='complete' && !!document.querySelector('h1')")) break;}
    await evaluate("document.fonts.ready.then(()=>true)");
    await delay(2000);
    const point=await evaluate("(()=>{const r=document.querySelector('input[aria-label=\"Vendor or service\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await send("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});
    await send("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
    for(const key of "Wedding"){await send("Input.dispatchKeyEvent",{type:"keyDown",key,text:key});await send("Input.dispatchKeyEvent",{type:"keyUp",key});}
    const menu=await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Open navigation\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await send("Input.dispatchMouseEvent",{type:"mousePressed",...menu,button:"left",clickCount:1});
    await send("Input.dispatchMouseEvent",{type:"mouseReleased",...menu,button:"left",clickCount:1});
    await delay(1000);
    const run=await evaluate("({...window.__uiPerf,resources:performance.getEntriesByType('resource').reduce((a,e)=>a+e.transferSize,0),resourceTimings:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),type:e.initiatorType,start:Math.round(e.startTime),end:Math.round(e.responseEnd),bytes:e.transferSize}))})");
    run.interactionMaxMs=Math.max(0,...Object.values(run.interactions));runs.push(run);
    console.log(JSON.stringify({run:index+1,lcp:run.lcp,lcpElement:run.lcpElement,cls:run.cls,interactionMaxMs:run.interactionMaxMs,resourceBytes:run.resources}));
  }
  const report={conditions:{viewport:"390x844",cpuSlowdown:4,latencyMs:150,downloadBytesPerSecond:200000,cache:"disabled",transport:"local static HTTP without content compression",api:"isolated fixtures",browser:"installed Chrome"},runs,note:"Lab observations of LCP, cumulative layout shifts and the maximum sampled event interaction. Not Lighthouse scores, production field INP, or live API performance."};
  fs.writeFileSync(path.join(cache,"performance-results.json"),JSON.stringify(report,null,2));
} finally { await send("Browser.close").catch(()=>{});ws.close();browser.kill();server.close(); }
