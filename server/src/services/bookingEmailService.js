import { createHash } from "node:crypto";
import net from "node:net";
import nodemailer from "nodemailer";
import { validateEmail } from "../utils/validation.js";

let testSender;
const DELIVERY_TIMEOUT_MS = 35_000;
const events = {
  booking_requested: { status: "Pending", subject: "Planzo booking request received", customer: "Your booking request was sent.", vendor: "You have a new booking request." },
  booking_accepted: { status: "Accepted", subject: "Planzo booking accepted", customer: "Your booking has been accepted.", vendor: "The booking has been accepted." },
  booking_rejected: { status: "Rejected", subject: "Planzo booking request declined", customer: "Your booking request has been declined.", vendor: "The booking request has been declined." },
  booking_cancelled: { status: "Cancelled", subject: "Planzo booking cancelled", customer: "Your booking has been cancelled.", vendor: "The booking has been cancelled." },
  booking_completed: { status: "Completed", subject: "Planzo booking completed", customer: "Your booking has been marked completed.", vendor: "The booking has been marked completed." },
};

export function setBookingEmailSenderForTests(sender) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Email test injection is only available in tests.");
  if (sender !== undefined && typeof sender !== "function")
    throw new Error("Booking email test sender must be a function.");
  testSender = sender;
}

function frontendOrigin() {
  const configured = process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");
  const first = configured.split(",")[0].trim();
  let url;
  try { url = new URL(first); } catch {
    throw new Error("Booking email requires a valid CLIENT_URL origin.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== first)
    throw new Error("Booking email CLIENT_URL must be an origin without a path or credentials.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Booking email CLIENT_URL must use HTTPS in production.");
  return first;
}

// Workers check configuration before claiming jobs, so a deployment mistake does
// not consume delivery attempts. Enqueueing a booking never depends on SMTP.
export function validateBookingEmailConfiguration() {
  frontendOrigin();
  const host = process.env.SMTP_HOST?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  const legacyFrom = process.env.SMTP_FROM?.trim();
  const password = process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS;
  if (!host || !(fromEmail || legacyFrom))
    throw new Error("Booking email requires SMTP_HOST and SMTP_FROM_EMAIL (or SMTP_FROM).");
  if ([host, fromEmail || legacyFrom, process.env.SMTP_FROM_NAME || ""].some((value) => /[\r\n]/.test(value)))
    throw new Error("Booking email SMTP sender configuration is invalid.");
  if (fromEmail) validateEmail(fromEmail);
  if (Boolean(process.env.SMTP_USER) !== Boolean(password))
    throw new Error("Booking email requires both SMTP_USER and SMTP_APP_PASSWORD (or SMTP_PASS), or neither.");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Booking email SMTP_PORT is invalid.");
  if (process.env.SMTP_SECURE && !["true", "false"].includes(process.env.SMTP_SECURE))
    throw new Error("Booking email SMTP_SECURE is invalid.");
  return {
    from: fromEmail ? { name: process.env.SMTP_FROM_NAME || "Planzo", address: fromEmail } : legacyFrom,
    transportOptions: {
      host, port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER && password ? { user: process.env.SMTP_USER, pass: password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    },
  };
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function renderBookingEmail(job) {
  const event = Object.hasOwn(events, job?.eventType) ? events[job.eventType] : null;
  const payload = job?.payload;
  if (!event || !payload || !["customer", "vendor"].includes(payload.recipientRole))
    throw new Error("Booking email event or recipient role is invalid.");
  const day = payload.eventDateOnly;
  const date = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00.000Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    throw new Error("Booking email requires a valid YYYY-MM-DD event date.");
  if (!job.bookingId) throw new Error("Booking email requires a booking reference.");
  const dashboard = `${frontendOrigin()}/${payload.recipientRole}/dashboard`;
  const greeting = payload.recipientRole === "customer" ? payload.customerName : payload.vendorName;
  const introduction = event[payload.recipientRole];
  const rows = [
    ["Booking reference", String(job.bookingId)],
    ["Status", event.status],
    ["Customer", String(payload.customerName || "Customer")],
    ["Vendor", String(payload.vendorName || "Vendor")],
    ["Service", String(payload.service || "Event service")],
    ["Event", String(payload.eventType || "Event")],
    ["Event date", day],
    ["Location", String(payload.eventLocation || "See your dashboard")],
  ];
  const guidance = "Open your dashboard for the latest status and any contact details you are authorized to see.";
  const footer = "This update reflects the booking when it was recorded. Your dashboard shows its latest status.";
  return {
    subject: event.subject,
    text: [
      "Planzo", "", `Hello ${greeting || "there"},`, "", introduction, "",
      ...rows.map(([label, value]) => `${label}: ${value}`), "", guidance,
      `View booking: ${dashboard}`, "", footer, "", "Planzo - Making Event Planning Easier",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f7f7f5;padding:24px 12px;font-family:Arial,sans-serif;color:#20201e;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5df;border-radius:12px;padding:28px 20px;">
    <div style="color:#b5673e;font-size:24px;font-weight:700;">Planzo</div>
    <p style="margin:24px 0 12px;line-height:1.6;">Hello ${escapeHtml(greeting || "there")},</p>
    <h1 style="margin:0 0 20px;font-size:24px;line-height:1.4;">${escapeHtml(introduction)}</h1>
    <table role="presentation" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;line-height:1.6;">
      ${rows.map(([label, value]) => `<tr><td style="width:35%;padding:8px 10px 8px 0;vertical-align:top;color:#66635e;">${escapeHtml(label)}</td><td style="padding:8px 0;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value)}</td></tr>`).join("\n      ")}
    </table>
    <p style="margin:24px 0 20px;font-size:14px;line-height:1.6;">${escapeHtml(guidance)}</p>
    <a href="${escapeHtml(dashboard)}" style="display:inline-block;max-width:100%;box-sizing:border-box;background:#b5673e;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-size:15px;font-weight:700;">View booking</a>
    <hr style="border:0;border-top:1px solid #e7e5df;margin:28px 0 20px;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#817d76;">${escapeHtml(footer)}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#817d76;">Planzo - Making Event Planning Easier</p>
  </div>
</body></html>`,
  };
}

function messageId(job) {
  const eventId = job.eventId || job._id;
  const recipientId = job.recipientUserId || job._id;
  if (!eventId || !recipientId) throw new Error("Booking email requires a stable event and recipient identity.");
  const digest = createHash("sha256").update(JSON.stringify([String(eventId), String(recipientId)])).digest("hex");
  return `<planzo-${digest}@booking.planzo>`;
}

function checkAcceptance(info, recipient) {
  const accepted = info?.accepted;
  const address = accepted?.[0]?.address || accepted?.[0];
  if (!Array.isArray(accepted) || accepted.length !== 1 ||
    String(address).trim().toLowerCase() !== recipient.toLowerCase() || info.rejected?.length)
    throw new Error("SMTP did not accept the booking email recipient.");
  return info;
}

function deliveryTimeout() {
  const error = new Error("Booking email delivery timed out.");
  error.code = "ETIMEDOUT";
  return error;
}

function cancellableSocket() {
  const controller = new AbortController();
  const sockets = new Set();
  return {
    getSocket(options, callback) {
      if (controller.signal.aborted) return callback(deliveryTimeout());
      let socket;
      let timer;
      let returned = false;
      const finish = (error, result) => {
        if (returned) return;
        returned = true;
        clearTimeout(timer);
        if (socket) {
          socket.removeListener("connect", connected);
          socket.removeListener("error", failed);
        }
        callback(error, result);
      };
      const failed = (error) => finish(error);
      const connected = () => {
        if (controller.signal.aborted) {
          socket.destroy();
          return finish(deliveryTimeout());
        }
        // Nodemailer owns SMTP/TLS negotiation; this is always an ordinary TCP
        // socket. secure:true and STARTTLS still upgrade it inside Nodemailer.
        finish(null, { connection: socket });
      };
      try {
        socket = net.createConnection({ host: options.host, port: options.port, signal: controller.signal });
        sockets.add(socket);
        // Keep teardown errors handled after Nodemailer detaches its listeners.
        socket.on("error", () => {});
        socket.once("close", () => sockets.delete(socket));
        socket.once("error", failed);
        socket.once("connect", connected);
        timer = setTimeout(() => {
          finish(deliveryTimeout());
          socket.destroy();
        }, options.connectionTimeout || 10_000);
      } catch (error) {
        finish(error);
      }
    },
    cancel() {
      controller.abort();
      for (const socket of sockets) socket.destroy();
    },
  };
}

export async function sendBookingEmail(job) {
  if (typeof job?.recipientEmail !== "string") throw new Error("Booking email requires one recipient.");
  validateEmail(job.recipientEmail);
  const message = {
    to: job.recipientEmail.trim(),
    ...renderBookingEmail(job),
    messageId: messageId(job),
  };
  let transport;
  let connection;
  let deliver;
  if (process.env.NODE_ENV === "test") {
    if (!testSender) throw new Error("Booking email test sender is not configured; SMTP is disabled in tests.");
    deliver = () => testSender(message);
  } else {
    const configuration = validateBookingEmailConfiguration();
    message.from = configuration.from;
    connection = cancellableSocket();
    transport = nodemailer.createTransport({ ...configuration.transportOptions, getSocket: connection.getSocket });
    deliver = () => transport.sendMail(message);
  }
  let timer;
  try {
    const info = await Promise.race([
      Promise.resolve().then(deliver),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(deliveryTimeout());
          connection?.cancel();
        }, DELIVERY_TIMEOUT_MS);
      }),
    ]);
    return checkAcceptance(info, message.to);
  } finally {
    clearTimeout(timer);
    // SMTPTransport.close() does not stop active sends. Destroy the socket we
    // supplied through the documented getSocket hook before releasing the job.
    connection?.cancel();
    if (transport) {
      try { transport.close(); } catch { /* Delivery result must not be hidden by cleanup. */ }
    }
  }
}
