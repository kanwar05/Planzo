import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const ACCESS_COOKIE_NAME = "planzo_access";
export const REFRESH_COOKIE_NAME = "planzo_refresh";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge,
});

const requireJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
};

export default function generateToken(userId) {
  return generateAccessToken(userId);
}

export function generateAccessToken(userId) {
  requireJwtSecret();

  return jwt.sign({ id: userId, type: "access" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
}

export function verifyAccessToken(token) {
  requireJwtSecret();
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  if (payload.type && payload.type !== "access") {
    throw new Error("Invalid token type.");
  }

  return payload;
}

export function createOpaqueToken() {
  return crypto.randomBytes(48).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiryDate() {
  const days = Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30;
  return new Date(Date.now() + days * ONE_DAY_MS);
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(
    ACCESS_COOKIE_NAME,
    accessToken,
    cookieOptions(Number(process.env.ACCESS_COOKIE_MAX_AGE_MS) || 15 * 60 * 1000),
  );
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    cookieOptions(
      Number(process.env.REFRESH_COOKIE_MAX_AGE_MS) || 30 * ONE_DAY_MS,
    ),
  );
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, cookieOptions(0));
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(0));
}
