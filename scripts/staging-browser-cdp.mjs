import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const localOrigin = (value) => {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("local_browser_target_required");
  return url.origin;
};

export function safeBrowserEvidence(runId, checks, metrics = {}) {
  return {
    event: "local_browser_rehearsal", runId, scope: "local_real_stack",
    browser: "Chrome", apiMocking: false, externalPageRequestsBlocked: true,
    success: checks.length > 0 && checks.every((check) => check.status === "pass"),
    checks: checks.map(({ name, status }) => ({ name, status })),
    metrics,
    hosted: "PENDING", firefox: "PENDING", safari: "PENDING",
    secureCrossSiteCookies: "PENDING",
  };
}

export async function openLocalChrome({ frontendOrigin, apiOrigin, cacheRoot, chromePath }) {
  const allowed = new Set([localOrigin(frontendOrigin), localOrigin(apiOrigin)]);
  const executable = chromePath || process.env.CHROME_PATH || (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
  if (!existsSync(executable)) throw new Error("chrome_unavailable");
  const root = path.resolve(cacheRoot);
  mkdirSync(root, { recursive: true });
  const profile = mkdtempSync(path.join(root, "run-"));
  const browser = spawn(executable, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--disable-extensions", "--disable-sync", "--metrics-recording-only",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let spawnFailed = false;
  browser.on("error", () => { spawnFailed = true; });
  let socket;
  let next = 0;
  const pending = new Map();
  const sessions = new Map();
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    try { socket?.close(); } catch { /* Continue process cleanup. */ }
    if (browser.exitCode === null && browser.signalCode === null) {
      const ended = new Promise((resolve) => browser.once("exit", resolve));
      browser.kill();
      await Promise.race([ended, delay(5000)]);
    }
    for (const operation of pending.values()) operation.reject(new Error("browser_closed"));
    if (!path.resolve(profile).startsWith(root + path.sep)) throw new Error("unsafe_browser_cleanup");
    // Windows may briefly retain Chrome's profile handles after process exit.
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("browser_command_timeout")); }, 15000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  try {
    const active = path.join(profile, "DevToolsActivePort");
    let lines;
    for (let index = 0; index < 100; index += 1) {
      if (spawnFailed || browser.exitCode !== null) throw new Error("chrome_start_failed");
      try { lines = readFileSync(active, "utf8").trim().split("\n"); } catch { /* Wait for Chrome's own port file. */ }
      if (lines?.length === 2) break;
      await delay(100);
    }
    if (!lines?.[0] || !/^\d+$/.test(lines[0])) throw new Error("chrome_start_timeout");
    socket = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error("chrome_connection_failed"));
    });
    socket.onmessage = async (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id) {
        const operation = pending.get(message.id);
        if (!operation) return;
        pending.delete(message.id);
        if (message.error) operation.reject(new Error("browser_protocol_failed"));
        else operation.resolve(message.result);
        return;
      }
      const page = sessions.get(message.sessionId);
      if (message.method === "Network.responseReceived" && page) {
        const response = message.params.response;
        try {
          const url = new URL(response.url);
          if (url.origin === apiOrigin) page.responses.push({ path: url.pathname, status: response.status });
        } catch { /* Ignore browser-internal URLs. */ }
      }
      if (message.method === "Fetch.requestPaused") {
        const { requestId, request } = message.params;
        let permitted = false;
        try { permitted = allowed.has(new URL(request.url).origin) || /^(?:data|blob):/.test(request.url); } catch { /* Refuse unknown targets. */ }
        try {
          await command(permitted ? "Fetch.continueRequest" : "Fetch.failRequest", {
            requestId, ...(permitted ? {} : { errorReason: "BlockedByClient" }),
          }, message.sessionId);
        } catch { /* A page closing can cancel a paused request. */ }
      }
    };
    async function page() {
      const { browserContextId } = await command("Target.createBrowserContext");
      const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId });
      const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
      const send = (method, params) => command(method, params, sessionId);
      const current = { responses: [] };
      sessions.set(sessionId, current);
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
      const evaluate = async (expression) => {
        const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error("browser_evaluation_failed");
        return result.result.value;
      };
      const wait = async (expression, timeoutMs = 15000) => {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
          try { if (await evaluate(expression)) return; } catch { /* Navigation can replace an execution context. */ }
          await delay(100);
        }
        throw new Error("browser_assertion_timeout");
      };
      return Object.assign(current, {
        send, evaluate, wait,
        async navigate(value) {
          const url = new URL(value, frontendOrigin);
          if (!allowed.has(url.origin)) throw new Error("browser_navigation_refused");
          await send("Page.navigate", { url: url.toString() });
          await wait("document.readyState === 'complete'");
        },
        async fill(selector, value) {
          await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
          await evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); const prototype = field.tagName === 'SELECT' ? HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(String(value))}); field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
        },
        async fillLabel(label, value) {
          const expression = `(() => { const label = [...document.querySelectorAll('label')].find(item => (item.querySelector('.label')?.textContent || item.textContent).trim() === ${JSON.stringify(label)}); if (!label) return false; const field = label.control || label.querySelector('input,textarea,select'); if (!field) return false; field.setAttribute('data-local-rehearsal-field','active'); return true; })()`;
          await wait(expression);
          await this.fill('[data-local-rehearsal-field="active"]', value);
          await evaluate(`document.querySelector('[data-local-rehearsal-field="active"]').removeAttribute('data-local-rehearsal-field')`);
        },
        async click(text, articleText) {
          const expression = `(() => { const root = ${articleText ? `[...document.querySelectorAll('article')].find(item => item.textContent.includes(${JSON.stringify(articleText)}))` : "document"}; const button = root && [...root.querySelectorAll('button')].find(item => item.textContent.replace(/\\s+/g,' ').trim() === ${JSON.stringify(text)} && !item.disabled); if (!button) return false; button.click(); return true; })()`;
          await wait(expression);
        },
        async api(suffix, { method = "GET", body } = {}) {
          if (!suffix.startsWith("/") || suffix.startsWith("//")) throw new Error("invalid_browser_api_path");
          return evaluate(`(async () => { const began = performance.now(); const response = await fetch(${JSON.stringify(apiOrigin + "/api" + suffix)}, { method:${JSON.stringify(method)}, credentials:'include', headers:${JSON.stringify(body === undefined ? {} : { "Content-Type": "application/json" })}, ${body === undefined ? "" : `body:JSON.stringify(${JSON.stringify(body)}),`} }); const body = await response.json(); return {status:response.status,body,elapsedMs:Math.round(performance.now()-began)}; })()`);
        },
        async cookies() { return (await send("Network.getCookies", { urls: [frontendOrigin, apiOrigin] })).cookies; },
        async expireCookies(names) {
          for (const cookie of await this.cookies()) if (names.includes(cookie.name)) {
            await send("Network.setCookie", { name: cookie.name, value: cookie.value, url: apiOrigin, path: cookie.path, httpOnly: cookie.httpOnly, secure: cookie.secure, expires: Math.floor(Date.now() / 1000) - 10 });
          }
        },
        async upload(selector, filename) {
          const { root: document } = await send("DOM.getDocument");
          const { nodeId } = await send("DOM.querySelector", { nodeId: document.nodeId, selector });
          if (!nodeId) throw new Error("upload_control_missing");
          await send("DOM.setFileInputFiles", { nodeId, files: [filename] });
        },
      });
    }
    const version = await command("Browser.getVersion");
    return { page, close, version: version.product };
  } catch (error) { await close(); throw error; }
}
