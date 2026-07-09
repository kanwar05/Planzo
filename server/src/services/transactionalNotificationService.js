import nodemailer from "nodemailer";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

let cachedTransport = null;
let deliveryOverrides = null;

const hasEmailConfig = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_FROM &&
      String(process.env.ENABLE_EMAIL ?? "true") !== "false",
  );

const hasSmsConfig = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );

const hasSmsEnabled = () => String(process.env.ENABLE_SMS ?? "false") === "true";

const getSmsFromNumber = () =>
  process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatBookingSummary = (booking) => {
  const dateValue = booking.eventDateOnly || booking.eventDate;
  const dateLabel = dateValue
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(dateValue))
    : "the scheduled date";

  return `${booking.eventType} on ${dateLabel} from ${booking.eventStartTime} to ${booking.eventEndTime}`;
};

const formatBookingDetails = (booking) => {
  const dateValue = booking.eventDateOnly || booking.eventDate;
  const dateLabel = dateValue
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "UTC" }).format(
        new Date(dateValue),
      )
    : "the scheduled date";
  const venue = booking.eventLocation || booking.venue || "your venue";

  return {
    eventName: booking.eventType || "Booking",
    vendorName: booking.vendorName || booking.vendor?.businessName || "the vendor",
    dateLabel,
    timeLabel: `${booking.eventStartTime || "--:--"} to ${booking.eventEndTime || "--:--"}`,
    venue,
    bookingId: String(booking._id || booking.bookingId || ""),
    contactDetails:
      booking.contactDetails ||
      booking.customerPhone ||
      booking.customerEmail ||
      booking.phone ||
      booking.email ||
      "available on your Planzo account",
  };
};

const buildBaseHtml = ({ title, bodyLines, footer = "" }) => {
  const lines = bodyLines.map((line) => `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`).join("");
  const footerHtml = footer ? `<p style="margin:20px 0 0;color:#6b7280;font-size:12px;">${escapeHtml(footer)}</p>` : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;color:#111827;">
      <div style="border:1px solid #e5e7eb;border-radius:16px;padding:24px;background:#f9fafb;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;">${escapeHtml(title)}</h1>
        ${lines}
        ${footerHtml}
      </div>
    </div>
  `;
};

const buildSmsBody = (lines) => lines.filter(Boolean).join(" ").slice(0, 1500);

const getBookingReminderLeadMs = () => {
  const hours = Number(process.env.BOOKING_REMINDER_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return hours * ONE_HOUR_MS;
  }

  const legacyMs = Number(process.env.BOOKING_REMINDER_LEAD_MS);
  if (Number.isFinite(legacyMs) && legacyMs > 0) {
    return legacyMs;
  }

  return ONE_DAY_MS;
};

const getReviewReminderDelayMs = () => {
  const legacyMs = Number(process.env.REVIEW_REMINDER_DELAY_MS);
  if (Number.isFinite(legacyMs) && legacyMs > 0) {
    return legacyMs;
  }

  return 3 * ONE_DAY_MS;
};

function safeTitle(value) {
  return value || "Planzo notification";
}

export const setNotificationDeliveryOverrides = (overrides = null) => {
  deliveryOverrides = overrides;
};

const getEmailSender = () => deliveryOverrides?.sendEmail || sendEmail;
const getSmsSender = () => deliveryOverrides?.sendSms || sendSms;

const getEmailTransport = () => {
  if (!hasEmailConfig()) return null;

  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure:
        process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
    });
  }

  return cachedTransport;
};

const getClientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

async function sendEmail({ to, subject, text, html }) {
  if (!to || !hasEmailConfig()) {
    return { attempted: false, sent: false };
  }

  try {
    const transport = getEmailTransport();
    if (!transport) {
      return { attempted: false, sent: false };
    }

    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });

    return { attempted: true, sent: true };
  } catch (error) {
    console.error(`Email delivery failed: ${error.message}`);
    return { attempted: true, sent: false, error: error.message };
  }
}

async function sendSms({ to, body }) {
  if (!to || !hasSmsConfig() || !hasSmsEnabled()) {
    return { attempted: false, sent: false };
  }

  try {
    const basicAuth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
    ).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
        From: getSmsFromNumber(),
          To: to,
          Body: body,
        }),
      },
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`SMS delivery failed: ${response.status} ${details}`);
    }

    return { attempted: true, sent: true };
  } catch (error) {
    console.error(`SMS delivery failed: ${error.message}`);
    return { attempted: true, sent: false, error: error.message };
  }
}

async function sendToUser(user, payload) {
  if (!user) {
    return { email: { attempted: false, sent: false }, sms: { attempted: false, sent: false } };
  }

  if (payload.preferenceKey && !payload.force) {
    const preference = user.notificationPreferences?.[payload.preferenceKey];
    if (preference === false) {
      return {
        email: { attempted: false, sent: false, skipped: true },
        sms: { attempted: false, sent: false, skipped: true },
      };
    }
  }

  const text = payload.text;
  const html = payload.html || `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;

  const sendEmailImpl = getEmailSender();
  const sendSmsImpl = getSmsSender();
  const [email, sms] = await Promise.all([
    sendEmailImpl({
      to: user.email,
      subject: payload.subject,
      text,
      html,
    }),
    sendSmsImpl({
      to: user.phone,
      body: payload.smsText || text,
    }),
  ]);

  return { email, sms };
}

const formatSummary = formatBookingSummary;

export const notificationTemplates = {
  bookingCreated: ({ booking, vendorName, customerName }) => {
    const details = formatBookingDetails({ ...booking, vendorName });
    const title = `Booking created for ${details.eventName}`;
    const bodyLines = [
      `Hi ${customerName || "there"}, your booking request with ${details.vendorName} was created successfully.`,
      `Event: ${details.eventName}`,
      `Date: ${details.dateLabel}`,
      `Time: ${details.timeLabel}`,
      `Venue: ${details.venue}`,
      `Booking ID: ${details.bookingId}`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([
        `Planzo: booking created for ${details.eventName}.`,
        `${details.vendorName}, ${details.dateLabel}, ${details.timeLabel}.`,
        `Booking ID: ${details.bookingId}`,
      ]),
    };
  },
  bookingAccepted: ({ booking, vendorName }) => {
    const details = formatBookingDetails({ ...booking, vendorName });
    const title = `Booking accepted by ${details.vendorName}`;
    const bodyLines = [
      `Your booking has been accepted by ${details.vendorName}.`,
      `Event: ${details.eventName}`,
      `Date: ${details.dateLabel}`,
      `Time: ${details.timeLabel}`,
      `Booking ID: ${details.bookingId}`,
      `Status: Accepted`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([
        `Planzo: booking accepted by ${details.vendorName}.`,
        `${details.eventName}, ${details.dateLabel}, ${details.timeLabel}.`,
        `Booking ID: ${details.bookingId}. Status: Accepted`,
      ]),
    };
  },
  bookingRejected: ({ booking, vendorName, reason = "" }) => {
    const details = formatBookingDetails({ ...booking, vendorName });
    const title = `Booking rejected by ${details.vendorName}`;
    const bodyLines = [
      `Your booking request was rejected by ${details.vendorName}.`,
      `Event: ${details.eventName}`,
      `Booking ID: ${details.bookingId}`,
    ];
    if (reason) bodyLines.push(`Reason: ${reason}`);

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([
        `Planzo: booking rejected by ${details.vendorName}.`,
        `${details.eventName}. Booking ID: ${details.bookingId}.`,
        reason ? `Reason: ${reason}` : "",
      ]),
    };
  },
  bookingReminder: ({ booking, vendorName }) => {
    const details = formatBookingDetails({ ...booking, vendorName });
    const title = `Upcoming booking reminder`;
    const bodyLines = [
      `Reminder for your upcoming booking with ${details.vendorName}.`,
      `Event: ${details.eventName}`,
      `Date: ${details.dateLabel}`,
      `Time: ${details.timeLabel}`,
      `Venue: ${details.venue}`,
      `Contact: ${details.contactDetails}`,
      `Booking ID: ${details.bookingId}`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines, footer: "This reminder is sent once." }),
      smsText: buildSmsBody([
        `Planzo reminder: ${details.eventName} with ${details.vendorName}.`,
        `${details.dateLabel}, ${details.timeLabel}, ${details.venue}.`,
        `Booking ID: ${details.bookingId}`,
      ]),
    };
  },
  reviewReminder: ({ booking, vendorName }) => {
    const details = formatBookingDetails({ ...booking, vendorName });
    const title = `Please review ${details.vendorName}`;
    const bodyLines = [
      `Your booking with ${details.vendorName} is complete. Please leave a review.`,
      `Event: ${details.eventName}`,
      `Date: ${details.dateLabel}`,
      `Booking ID: ${details.bookingId}`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([
        `Planzo reminder: review ${details.vendorName}.`,
        `${details.eventName}, ${details.dateLabel}. Booking ID: ${details.bookingId}`,
      ]),
    };
  },
  passwordReset: ({ resetLink, userName }) => {
    const title = `Reset your Planzo password`;
    const bodyLines = [
      `Hi ${userName || "there"}, use the link below to reset your password.`,
      resetLink,
      `If you did not request this, you can ignore this message.`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([
        `Planzo password reset requested.`,
        `If this wasn't you, contact support.`,
      ]),
    };
  },
  passwordChanged: ({ userName }) => {
    const title = `Your Planzo password was changed`;
    const bodyLines = [
      `Hi ${userName || "there"}, your Planzo password was changed successfully.`,
      `If this wasn't you, contact support immediately.`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([`Planzo: your password was changed successfully.`, `If this wasn't you, contact support immediately.`]),
    };
  },
  vendorApproved: ({ vendorName }) => {
    const title = `Vendor approved`;
    const bodyLines = [
      `Your vendor profile for ${vendorName} has been approved.`,
      `You can now accept bookings.`,
    ];

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([`Planzo: vendor profile approved for ${vendorName}.`]),
    };
  },
  vendorRejected: ({ vendorName, reason = "" }) => {
    const title = `Vendor rejected`;
    const bodyLines = [
      `Your vendor profile for ${vendorName} was rejected.`,
    ];
    if (reason) bodyLines.push(`Reason: ${reason}`);

    return {
      subject: title,
      text: bodyLines.join("\n"),
      html: buildBaseHtml({ title, bodyLines }),
      smsText: buildSmsBody([
        `Planzo: vendor profile rejected for ${vendorName}.`,
        reason ? `Reason: ${reason}` : "",
      ]),
    };
  },
};

export const sendTransactionalNotification = async ({
  user,
  template,
  templateData = {},
  preferenceKey,
  force = false,
}) => {
  const render = notificationTemplates[template];
  if (!render) {
    throw new Error(`Unknown notification template: ${template}`);
  }

  return sendToUser(user, {
    ...render(templateData),
    preferenceKey,
    force,
  });
};

export const getNotificationTimings = () => ({
  bookingReminderLeadMs: getBookingReminderLeadMs(),
  reviewReminderDelayMs: getReviewReminderDelayMs(),
});

export async function sendBookingCreatedNotification({ customer, vendorUser, vendorName, booking }) {
  return Promise.all([
    sendTransactionalNotification({
      user: customer,
      template: "bookingCreated",
      templateData: { booking, vendorName, customerName: customer?.name },
      preferenceKey: "bookingUpdates",
    }),
    sendTransactionalNotification({
      user: vendorUser,
      template: "bookingCreated",
      templateData: { booking, vendorName, customerName: customer?.name },
      preferenceKey: "bookingUpdates",
    }),
  ]);
}

export async function sendBookingStatusNotification({ customer, vendorName, booking, status }) {
  const template = status === "accepted" ? "bookingAccepted" : status === "rejected" ? "bookingRejected" : null;
  if (!template) return { email: { sent: false }, sms: { sent: false } };

  return sendTransactionalNotification({
    user: customer,
    template,
    templateData: { booking, vendorName, reason: booking.rejectionReason || "" },
    preferenceKey: "bookingUpdates",
  });
}

export async function sendBookingReminderNotification({ customer, vendorUser, vendorName, booking }) {
  return Promise.all([
    sendTransactionalNotification({
      user: customer,
      template: "bookingReminder",
      templateData: { booking, vendorName },
      preferenceKey: "bookingUpdates",
    }),
    sendTransactionalNotification({
      user: vendorUser,
      template: "bookingReminder",
      templateData: { booking, vendorName },
      preferenceKey: "bookingUpdates",
    }),
  ]);
}

export async function sendPasswordResetNotification({ user, resetToken }) {
  const clientUrl = getClientUrl();
  const resetLink = `${clientUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  return sendTransactionalNotification({
    user,
    template: "passwordReset",
    templateData: { resetLink, userName: user?.name },
    force: true,
  });
}

export async function sendPasswordResetConfirmation({ user }) {
  return sendTransactionalNotification({
    user,
    template: "passwordChanged",
    templateData: { userName: user?.name },
    force: true,
  });
}

export async function sendReviewReminderNotification({ customer, vendorName, booking }) {
  return sendTransactionalNotification({
    user: customer,
    template: "reviewReminder",
    templateData: { booking, vendorName },
    preferenceKey: "reviewReminders",
  });
}

export async function sendVendorVerificationUpdateNotification({ vendorUser, vendorName, status, reason = "" }) {
  return sendTransactionalNotification({
    user: vendorUser,
    template: status === "approved" ? "vendorApproved" : "vendorRejected",
    templateData: { vendorName, reason },
    force: true,
  });
}

export { ONE_DAY_MS };