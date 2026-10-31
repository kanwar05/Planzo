import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import { afterEach, beforeEach, mock, test } from "node:test";
import nodemailer from "nodemailer";
import {
  renderBookingEmail,
  sendBookingEmail,
  setBookingEmailSenderForTests,
  validateBookingEmailConfiguration,
} from "../src/services/bookingEmailService.js";

const environmentKeys = [
  "NODE_ENV", "CLIENT_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE",
  "SMTP_USER", "SMTP_APP_PASSWORD", "SMTP_PASS", "SMTP_FROM_EMAIL",
  "SMTP_FROM", "SMTP_FROM_NAME",
];
let originalEnvironment;
const eventStates = {
  booking_requested: "Pending", booking_accepted: "Accepted",
  booking_rejected: "Rejected", booking_cancelled: "Cancelled", booking_completed: "Completed",
};
const job = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  bookingId: "507f191e810c19729de860ea",
  eventId: "7a719d3c-9be1-4c91-9795-de173006163c",
  eventType: "booking_accepted",
  recipientUserId: "507f1f77bcf86cd799439012",
  recipientEmail: "recipient@example.com",
  payload: {
    customerName: "Asha Singh", vendorName: "Horizon Events", service: "Decoration",
    eventType: "Wedding", eventDateOnly: "2028-02-29", eventLocation: "Delhi event hall",
    recipientRole: "customer",
  },
  ...overrides,
});
const accepted = (message) => ({ accepted: [message.to], rejected: [], messageId: message.messageId });
function configureSmtp() {
  process.env.SMTP_HOST = "smtp.example.invalid";
  process.env.SMTP_USER = "mailer@example.com";
  process.env.SMTP_APP_PASSWORD = "test-only-password";
  process.env.SMTP_FROM_EMAIL = "bookings@example.com";
  process.env.SMTP_FROM_NAME = "Planzo Events";
}

beforeEach(() => {
  originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  for (const key of environmentKeys) delete process.env[key];
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "https://planzo.example,https://second.example";
  setBookingEmailSenderForTests(undefined);
});
afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  process.env.NODE_ENV = "test";
  setBookingEmailSenderForTests(undefined);
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

test("every booking event renders branded plain text and responsive HTML for each participant", () => {
  for (const [eventType, state] of Object.entries(eventStates)) {
    for (const recipientRole of ["customer", "vendor"]) {
      const notification = job({ eventType });
      notification.payload.recipientRole = recipientRole;
      const message = renderBookingEmail(notification);
      assert.deepEqual(Object.keys(message).sort(), ["html", "subject", "text"]);
      assert.match(message.subject, /Planzo booking/);
      assert.ok(message.text.includes(`Status: ${state}`));
      for (const body of [message.text, message.html]) {
        assert.ok(body.includes(notification.bookingId));
        assert.ok(body.includes("2028-02-29"));
        assert.ok(body.includes("Horizon Events"));
        assert.ok(body.includes("Decoration"));
        assert.ok(body.includes("Wedding"));
        assert.ok(body.includes(`https://planzo.example/${recipientRole}/dashboard`));
        assert.equal(body.includes("second.example"), false);
      }
      assert.match(message.html, /name="viewport"/);
      assert.match(message.html, /max-width:560px/);
      assert.match(message.html, /width:100%/);
    }
  }
});

test("HTML escapes every dynamic value and keeps the dashboard destination independent of payload input", () => {
  const unsafe = `<img src=x onerror="alert('x')"> & <script>bad()</script>`;
  const notification = job({ bookingId: unsafe });
  for (const key of ["customerName", "vendorName", "service", "eventType", "eventLocation"])
    notification.payload[key] = unsafe;
  notification.payload.url = "javascript:alert(1)";
  notification.payload.dashboardUrl = "https://attacker.example";
  const message = renderBookingEmail(notification);
  assert.equal(message.html.includes(unsafe), false);
  assert.equal(message.html.includes("<script>"), false);
  assert.equal(message.html.includes("<img"), false);
  assert.ok(message.html.includes("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp;"));
  assert.deepEqual([...message.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ["https://planzo.example/customer/dashboard"]);
  assert.equal(message.html.includes("attacker.example"), false);
  assert.equal(message.subject.includes(unsafe), false);
  assert.ok(message.text.includes(unsafe));
});

test("all message bodies omit private account data and business contacts, including delayed acceptance", () => {
  const privateValues = ["customer-private@example.com", "vendor-private@example.com", "7777777777", "6666666666", "shared-business@example.com", "5555555555", "secret-token"];
  for (const eventType of Object.keys(eventStates)) {
    const notification = job({
      eventType, recipientEmail: privateValues[0], customerEmail: privateValues[0], vendorEmail: privateValues[1],
      customerPhone: privateValues[2], vendorPhone: privateValues[3], token: privateValues[6],
      contactDetails: { email: privateValues[4], phone: privateValues[5] },
    });
    Object.assign(notification.payload, {
      customerEmail: privateValues[0], vendorEmail: privateValues[1],
      customerPhone: privateValues[2], vendorPhone: privateValues[3],
      contactDetails: notification.contactDetails,
      vendor: { contactDetails: notification.contactDetails },
      status: "cancelled", // A later status must not reveal contacts in an old accepted event.
    });
    const message = renderBookingEmail(notification);
    for (const secret of privateValues) {
      assert.equal(message.text.includes(secret), false, `${eventType}: ${secret}`);
      assert.equal(message.html.includes(secret), false, `${eventType}: ${secret}`);
    }
    assert.match(message.text, /latest status/);
  }
});

test("dates remain calendar literals and malformed dates, events and roles fail before delivery", () => {
  const notification = job();
  assert.ok(renderBookingEmail(notification).text.includes("Event date: 2028-02-29"));
  for (const eventDateOnly of ["2027-02-29", "2028-04-31", "2028-2-29", "2028-02-29T00:00:00Z", "2028-02-29T23:00:00-05:00", "", null]) {
    notification.payload.eventDateOnly = eventDateOnly;
    assert.throws(() => renderBookingEmail(notification), /YYYY-MM-DD/);
  }
  assert.throws(() => renderBookingEmail(job({ eventType: "toString" })), /event or recipient role/);
  assert.throws(() => renderBookingEmail(job({ eventType: "booking_paid" })), /event or recipient role/);
  notification.payload.eventDateOnly = "2028-02-29";
  notification.payload.recipientRole = "admin";
  assert.throws(() => renderBookingEmail(notification), /event or recipient role/);
});

test("dashboard links require a trusted origin and production HTTPS while local development has the existing default", () => {
  for (const origin of ["javascript:alert(1)", "https://user:password@example.com", "https://planzo.example/path", "https://planzo.example/", "https://planzo.example?redirect=evil", "not a URL"]) {
    process.env.CLIENT_URL = origin;
    assert.throws(() => renderBookingEmail(job()), /CLIENT_URL/);
  }
  process.env.NODE_ENV = "production";
  process.env.CLIENT_URL = "http://planzo.example";
  assert.throws(() => renderBookingEmail(job()), /HTTPS/);
  delete process.env.CLIENT_URL;
  assert.throws(() => renderBookingEmail(job()), /CLIENT_URL/);
  process.env.NODE_ENV = "development";
  assert.ok(renderBookingEmail(job()).text.includes("http://localhost:5173/customer/dashboard"));
});

test("the injected provider receives one private recipient and stable retry Message-IDs", async () => {
  const messages = [];
  setBookingEmailSenderForTests(async (message) => { messages.push(message); return accepted(message); });
  const notification = job({ cc: "other@example.com", bcc: "hidden@example.com" });
  await sendBookingEmail(notification);
  await sendBookingEmail({ ...notification, attempts: 4 });
  assert.equal(messages[0].to, "recipient@example.com");
  assert.equal(messages[0].cc, undefined);
  assert.equal(messages[0].bcc, undefined);
  assert.equal(messages[0].envelope, undefined);
  assert.equal(messages[0].messageId, messages[1].messageId);
  assert.match(messages[0].messageId, /^<planzo-[a-f0-9]{64}@booking\.planzo>$/);
  assert.equal(messages[0].text, renderBookingEmail(notification).text);
  await sendBookingEmail({ ...notification, recipientUserId: "another-user" });
  assert.notEqual(messages[0].messageId, messages[2].messageId);
  await sendBookingEmail({ ...notification, eventId: undefined, recipientUserId: undefined });
  await sendBookingEmail({ ...notification, eventId: undefined, recipientUserId: undefined });
  assert.equal(messages[3].messageId, messages[4].messageId);
});

test("recipient lists and header syntax are rejected without invoking the provider", async () => {
  let calls = 0;
  setBookingEmailSenderForTests(async (message) => { calls += 1; return accepted(message); });
  for (const recipientEmail of ["one@example.com,two@example.com", "one@example.com;two@example.com", "Name <one@example.com>", "one@example.com\r\nBcc: attacker@example.com", ["one@example.com", "two@example.com"]])
    await assert.rejects(sendBookingEmail(job({ recipientEmail })), /recipient|email address/);
  assert.equal(calls, 0);
});

test("resolved SMTP rejection and missing acceptance remain delivery failures in the test seam", async () => {
  for (const response of [undefined, {}, { accepted: [], rejected: [] }, { accepted: ["other@example.com"], rejected: [] }, { accepted: ["recipient@example.com"], rejected: ["recipient@example.com"] }]) {
    setBookingEmailSenderForTests(async () => response);
    await assert.rejects(sendBookingEmail(job()), /did not accept/);
  }
  setBookingEmailSenderForTests(async () => { throw new Error("Provider unavailable"); });
  await assert.rejects(sendBookingEmail(job()), /Provider unavailable/);
});

test("test mode fails closed without injection and never constructs an SMTP transport", async () => {
  configureSmtp();
  const transport = mock.method(nodemailer, "createTransport", () => { throw new Error("Unexpected SMTP connection"); });
  await assert.rejects(sendBookingEmail(job()), /SMTP is disabled in tests/);
  assert.equal(transport.mock.callCount(), 0);
  process.env.NODE_ENV = "production";
  assert.throws(() => setBookingEmailSenderForTests(async () => ({})), /only available in tests/);
});

test("SMTP preflight reuses configured credentials and supports the legacy display-name sender", () => {
  configureSmtp();
  let configuration = validateBookingEmailConfiguration();
  assert.deepEqual(configuration.from, { name: "Planzo Events", address: "bookings@example.com" });
  assert.equal(configuration.transportOptions.port, 587);
  assert.equal(configuration.transportOptions.secure, false);
  assert.deepEqual(configuration.transportOptions.auth, { user: "mailer@example.com", pass: "test-only-password" });
  process.env.SMTP_PASS = "legacy-password";
  delete process.env.SMTP_APP_PASSWORD;
  delete process.env.SMTP_FROM_EMAIL;
  process.env.SMTP_FROM = "Planzo Legacy <legacy@example.com>";
  process.env.SMTP_PORT = "465";
  configuration = validateBookingEmailConfiguration();
  assert.equal(configuration.from, process.env.SMTP_FROM);
  assert.equal(configuration.transportOptions.secure, true);
  assert.equal(configuration.transportOptions.auth.pass, "legacy-password");
  delete process.env.SMTP_PASS;
  assert.throws(() => validateBookingEmailConfiguration(), /both SMTP_USER/);
  delete process.env.SMTP_USER;
  assert.equal(validateBookingEmailConfiguration().transportOptions.auth, undefined);
  delete process.env.SMTP_HOST;
  assert.throws(() => validateBookingEmailConfiguration(), /SMTP_HOST/);
});

test("real transport sends the rendered message and closes on success and resolved rejection", async () => {
  configureSmtp();
  process.env.NODE_ENV = "development";
  const messages = [];
  let closes = 0;
  let rejectRecipient = false;
  mock.method(nodemailer, "createTransport", (options) => {
    assert.equal(options.connectionTimeout, 10_000);
    assert.equal(options.greetingTimeout, 10_000);
    assert.equal(options.socketTimeout, 15_000);
    return {
      sendMail: async (message) => {
        messages.push(message);
        return rejectRecipient ? { accepted: [], rejected: [message.to] } : accepted(message);
      },
      close: () => { closes += 1; },
    };
  });
  await sendBookingEmail(job());
  assert.equal(closes, 1);
  assert.deepEqual(messages[0].from, { name: "Planzo Events", address: "bookings@example.com" });
  assert.equal(messages[0].subject, renderBookingEmail(job()).subject);
  rejectRecipient = true;
  await assert.rejects(sendBookingEmail(job()), /did not accept/);
  assert.equal(closes, 2);
});

test("a hanging SMTP send hits the total delivery timeout and closes the transport before the worker lease expires", async () => {
  configureSmtp();
  process.env.NODE_ENV = "development";
  let closes = 0;
  mock.method(nodemailer, "createTransport", () => ({ sendMail: () => new Promise(() => {}), close: () => { closes += 1; } }));
  mock.timers.enable({ apis: ["setTimeout"] });
  const result = assert.rejects(sendBookingEmail(job()), (error) => error.code === "ETIMEDOUT");
  await Promise.resolve();
  mock.timers.tick(35_000);
  await result;
  assert.equal(closes, 1);
});

test("the total deadline destroys the installed Nodemailer transport's real socket and prevents late DATA", { timeout: 5000 }, async () => {
  const commands = [];
  let peer;
  let reachedRecipient;
  const recipientReached = new Promise((resolve) => { reachedRecipient = resolve; });
  const server = net.createServer((socket) => {
    peer = socket;
    socket.on("error", () => {});
    socket.write("220 localhost fake SMTP\r\n");
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString();
      while (pending.includes("\r\n")) {
        const end = pending.indexOf("\r\n");
        const command = pending.slice(0, end);
        pending = pending.slice(end + 2);
        commands.push(command);
        if (/^EHLO /i.test(command)) socket.write("250 localhost\r\n");
        else if (/^MAIL FROM:/i.test(command)) socket.write("250 Sender accepted\r\n");
        else if (/^RCPT TO:/i.test(command)) reachedRecipient(); // Deliberately withhold the reply.
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  configureSmtp();
  process.env.NODE_ENV = "development";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(server.address().port);
  delete process.env.SMTP_USER;
  delete process.env.SMTP_APP_PASSWORD;
  mock.timers.enable({ apis: ["setTimeout"] });
  const result = assert.rejects(sendBookingEmail(job()), (error) => error.code === "ETIMEDOUT");
  try {
    await recipientReached;
    const closed = once(peer, "close");
    mock.timers.tick(35_000);
    await result;
    await closed;
    assert.equal(peer.destroyed, true);
    // A server reply arriving after the deadline cannot resume this SMTP send.
    peer.write("250 Delayed recipient acceptance\r\n", () => {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(commands.some((command) => /^DATA\b/i.test(command)), false);
  } finally {
    peer?.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("owned sockets preserve implicit TLS and STARTTLS rather than sending the message in cleartext", { timeout: 5000 }, async () => {
  for (const secure of [true, false]) {
    let peer;
    let sawHandshake;
    const handshake = new Promise((resolve) => { sawHandshake = resolve; });
    const plaintextCommands = [];
    const server = net.createServer((socket) => {
      peer = socket;
      socket.on("error", () => {});
      if (!secure) socket.write("220 localhost fake SMTP\r\n");
      socket.on("data", (chunk) => {
        if (chunk[0] === 0x16) return sawHandshake(chunk); // TLS Handshake record.
        const command = chunk.toString().trim();
        plaintextCommands.push(command);
        if (/^EHLO /i.test(command)) socket.write("250-localhost\r\n250 STARTTLS\r\n");
        else if (command === "STARTTLS") socket.write("220 Ready to start TLS\r\n");
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    configureSmtp();
    process.env.NODE_ENV = "development";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(server.address().port);
    process.env.SMTP_SECURE = String(secure);
    mock.timers.enable({ apis: ["setTimeout"] });
    const result = assert.rejects(sendBookingEmail(job()), (error) => error.code === "ETIMEDOUT");
    try {
      const hello = await handshake;
      assert.equal(hello[0], 0x16);
      assert.equal(plaintextCommands.some((command) => /^(?:AUTH|MAIL FROM|RCPT TO|DATA)\b/i.test(command)), false);
      if (secure) assert.deepEqual(plaintextCommands, []);
      else assert.equal(plaintextCommands.includes("STARTTLS"), true);
      const closed = once(peer, "close");
      mock.timers.tick(35_000);
      await result;
      await closed;
      assert.equal(peer.destroyed, true);
    } finally {
      peer?.destroy();
      await new Promise((resolve) => server.close(resolve));
      mock.timers.reset();
    }
  }
});
