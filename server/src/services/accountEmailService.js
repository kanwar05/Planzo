import nodemailer from "nodemailer";

let testSender;

// Tests capture email through this seam; production never exposes account tokens in responses or logs.
export function setAccountEmailSenderForTests(sender) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Email test injection is only available in tests.");
  testSender = sender;
}

function accountLink(path, token) {
  const base = (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")[0]
    .trim();
  const link = new URL(path, `${base.replace(/\/$/, "")}/`);
  link.searchParams.set("token", token);
  return link.toString();
}

async function send(message) {
  if (process.env.NODE_ENV === "test" && testSender) return testSender(message);
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    throw new Error("Account email requires SMTP_HOST and SMTP_FROM.");
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure:
      process.env.SMTP_SECURE === "true" ||
      Number(process.env.SMTP_PORT) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, ...message });
}

export function sendPasswordReset({ user, token }) {
  return send({
    to: user.email,
    subject: "Reset your Planzo password",
    text: `Reset your Planzo password using this link: ${accountLink("/reset-password", token)}\n\nThis link expires in 15 minutes and can be used once. If you did not request a reset, ignore this email.`,
  });
}

export function sendEmailChange({ email, token }) {
  return send({
    to: email,
    subject: "Verify your new Planzo email address",
    text: `Confirm this email address for your Planzo account: ${accountLink("/verify-email", token)}\n\nThis link expires in 15 minutes and can be used once. If you did not request this change, ignore this email.`,
  });
}
