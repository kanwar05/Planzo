import jwt from "jsonwebtoken";
import { validateStagingEnvironment } from "./stagingSafety.js";

export function validateEnvironment(env = process.env) {
  validateStagingEnvironment(env);
  const missing = ["MONGODB_URI", "JWT_SECRET"].filter((key) => !env[key]);
  if (missing.length)
    throw new Error(`Missing required configuration: ${missing.join(", ")}.`);
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    throw new Error("MONGODB_URI must be a MongoDB connection string.");
  if (env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  const production = env.NODE_ENV === "production";
  if (
    env.NODE_ENV &&
    !["development", "test", "production"].includes(env.NODE_ENV)
  )
    throw new Error("NODE_ENV must be development, test, or production.");
  if (production && !env.CLIENT_URL)
    throw new Error("CLIENT_URL is required in production.");
  for (const origin of (env.CLIENT_URL || "http://localhost:5173").split(",")) {
    let url;
    try {
      url = new URL(origin.trim());
    } catch {
      throw new Error("CLIENT_URL must contain valid frontend origins.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== origin.trim()
    )
      throw new Error(
        "CLIENT_URL must contain origins without paths, credentials, or trailing slashes.",
      );
    if (production && url.protocol !== "https:")
      throw new Error("Production CLIENT_URL must use HTTPS.");
  }
  for (const [key, fallback, max] of [
    ["PORT", 5001, 65535],
    ["SMTP_PORT", 587, 65535],
    ["JWT_REFRESH_EXPIRES_DAYS", 30, 365],
    ["TRUST_PROXY", 0, 10],
  ]) {
    const value = Number(env[key] ?? fallback);
    if (
      !Number.isInteger(value) ||
      value < (key === "TRUST_PROXY" ? 0 : 1) ||
      value > max
    )
      throw new Error(`${key} is invalid.`);
  }
  for (const [key, fallback, min, max] of [
    ["RATE_LIMIT_MAX", 300, 1, 100000],
    ["AUTH_RATE_LIMIT_MAX", 10, 1, 10000],
    ["PASSWORD_RESET_REQUEST_MAX", 3, 1, 10000],
    ["PASSWORD_RESET_ATTEMPT_MAX", 10, 1, 10000],
    ["ACCESS_COOKIE_MAX_AGE_MS", 15 * 60 * 1000, 1, 86400000],
    ["REFRESH_COOKIE_MAX_AGE_MS", 30 * 86400000, 1, 365 * 86400000],
    ["MONGO_SERVER_SELECTION_TIMEOUT_MS", 10000, 1000, 120000],
    ["MONGO_CONNECT_TIMEOUT_MS", 10000, 1000, 120000],
    ["MONGO_SOCKET_TIMEOUT_MS", 20000, 1000, 120000],
    ["MONGO_WAIT_QUEUE_TIMEOUT_MS", 5000, 1000, 120000],
    ["SLOW_REQUEST_MS", 1000, 100, 60000],
  ]) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  if (
    env.COOKIE_SAME_SITE &&
    !["lax", "strict", "none"].includes(env.COOKIE_SAME_SITE)
  )
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    throw new Error("SMTP_SECURE must be true or false.");
  const smtpPassword = env.SMTP_APP_PASSWORD || env.SMTP_PASS;
  if (Boolean(env.SMTP_USER) !== Boolean(smtpPassword))
    throw new Error(
      "Set both SMTP_USER and SMTP_APP_PASSWORD, or neither for a trusted relay.",
    );
  const smtpFrom = env.SMTP_FROM_EMAIL || env.SMTP_FROM;
  if (production && (!env.SMTP_HOST || !smtpFrom))
    throw new Error(
      "SMTP_HOST and SMTP_FROM_EMAIL (or SMTP_FROM) are required for account recovery in production.",
    );
  if (
    (env.SMTP_HOST || env.SMTP_FROM || env.SMTP_FROM_EMAIL) &&
    (!env.SMTP_HOST || !smtpFrom)
  )
    throw new Error(
      "Set SMTP_HOST and SMTP_FROM_EMAIL (or SMTP_FROM) for account email.",
    );
  if (
    production &&
    (!env.SMTP_HOST ||
      !env.SMTP_USER ||
      !smtpPassword ||
      !(env.SMTP_FROM_EMAIL || env.SMTP_FROM))
  )
    throw new Error(
      "SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD, and SMTP_FROM_EMAIL are required in production for OTP sign-in.",
    );
  if (production && !env.OTP_HMAC_SECRET)
    throw new Error("OTP_HMAC_SECRET is required in production.");
  if (env.OTP_HMAC_SECRET && env.OTP_HMAC_SECRET.length < 32)
    throw new Error("OTP_HMAC_SECRET must contain at least 32 characters.");
  for (const [key, fallback, max] of [
    ["OTP_EXPIRY_MINUTES", 5, 60],
    ["OTP_RESEND_COOLDOWN_SECONDS", 60, 3600],
  ]) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`${key} is invalid.`);
  }
  const cloudinary = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  if (
    cloudinary.some((key) => env[key]) &&
    !cloudinary.every((key) => env[key])
  )
    throw new Error(
      "Set all three Cloudinary variables to enable photo uploads.",
    );
  try {
    const token = jwt.sign({ configurationCheck: true }, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN || "15m",
    });
    const payload = jwt.decode(token);
    const seconds = payload.exp - payload.iat;
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400)
      throw new Error("Invalid access lifetime.");
  } catch {
    throw new Error("JWT_ACCESS_EXPIRES_IN must produce an access lifetime between 1 second and 24 hours; use units such as 15m.");
  }
}
