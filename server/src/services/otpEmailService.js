import nodemailer from "nodemailer";

let testSender;
let transporter;

export function setOtpEmailSenderForTests(sender) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Email test injection is only available in tests.");
  testSender = sender;
}

export async function sendLoginOtp({ email, code }) {
  const expiryMinutes = Number(process.env.OTP_EXPIRY_MINUTES || 5);
  const message = {
    to: email,
    subject: "Your Planzo Verification Code",
    text: [
      "Welcome to Planzo",
      "",
      `Your verification code is: ${code}`,
      "",
      `This code expires in ${expiryMinutes} minutes.`,
      "For your security, never share this code with anyone.",
      "If you did not request this code, you can ignore this email.",
      "",
      "Planzo - Making Event Planning Easier",
    ].join("\n"),
    html: `
      <div style="margin:0;background:#f7f7f5;padding:32px 16px;font-family:Arial,sans-serif;color:#20201e;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5df;border-radius:12px;padding:36px 28px;">
          <div style="color:#b5673e;font-size:24px;font-weight:700;letter-spacing:.02em;">Planzo</div>
          <h1 style="margin:28px 0 12px;font-size:24px;line-height:1.3;">Welcome to Planzo</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Your verification code is:</p>
          <div style="margin:0 0 24px;padding:18px;text-align:center;background:#fbf1eb;border-radius:8px;color:#9b4f2c;font-size:32px;font-weight:700;letter-spacing:8px;">${code}</div>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">This code expires in ${expiryMinutes} minutes.</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;"><strong>For your security, never share this code with anyone.</strong></p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#66635e;">If you did not request this code, you can ignore this email.</p>
          <hr style="border:0;border-top:1px solid #e7e5df;margin:28px 0 20px;">
          <p style="margin:0;font-size:13px;color:#817d76;">Planzo - Making Event Planning Easier</p>
        </div>
      </div>
    `,
  };
  if (process.env.NODE_ENV === "test" && testSender) return testSender(message);
  const password = process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !password || !fromEmail) {
    throw new Error(
      "OTP email requires SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD, and SMTP_FROM_EMAIL.",
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure:
        process.env.SMTP_SECURE === "true" ||
        Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  try {
    const info = await transporter.sendMail({
      from: {
        name: process.env.SMTP_FROM_NAME || "Planzo",
        address: fromEmail,
      },
      ...message,
    });
    if (!info.accepted?.length || info.rejected?.length) {
      throw new Error("SMTP rejected the OTP recipient.");
    }
  } catch (error) {
    const failure = new Error("OTP email delivery failed.");
    failure.code = error?.code;
    throw failure;
  }
}
