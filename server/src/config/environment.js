import jwt from "jsonwebtoken";

export function validateEnvironment(env = process.env) {
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
  if (
    env.COOKIE_SAME_SITE &&
    !["lax", "strict", "none"].includes(env.COOKIE_SAME_SITE)
  )
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    throw new Error("SMTP_SECURE must be true or false.");
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS))
    throw new Error(
      "Set both SMTP_USER and SMTP_PASS, or neither for a trusted relay.",
    );
  if (production && (!env.SMTP_HOST || !env.SMTP_FROM))
    throw new Error(
      "SMTP_HOST and SMTP_FROM are required for account recovery in production.",
    );
  if ((env.SMTP_HOST || env.SMTP_FROM) && (!env.SMTP_HOST || !env.SMTP_FROM))
    throw new Error("Set both SMTP_HOST and SMTP_FROM for account email.");
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
    jwt.sign({ configurationCheck: true }, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN || "15m",
    });
  } catch {
    throw new Error("JWT_ACCESS_EXPIRES_IN is invalid.");
  }
}
