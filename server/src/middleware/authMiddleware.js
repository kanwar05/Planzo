import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ACCESS_COOKIE_NAME } from "../utils/generateToken.js";

export const protect = asyncHandler(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const authorization = req.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  const token = req.cookies?.[ACCESS_COOKIE_NAME] || bearerToken;

  if (!token) {
    throw new ApiError(401, "Authentication required.");
  }

  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, "JWT authentication is not configured.");
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.type && payload.type !== "access") {
      throw new Error("Invalid token type.");
    }
  } catch {
    throw new ApiError(401, "Invalid or expired authentication token.");
  }

  if (!payload || typeof payload !== "object" || !/^[a-f0-9]{24}$/i.test(String(payload.id || ""))) {
    throw new ApiError(401, "Invalid or expired authentication token.");
  }
  const user = await User.findById(payload.id);

  if (!user) {
    throw new ApiError(401, "The user for this token no longer exists.");
  }
  if (user.accountStatus === "deactivated") {
    throw new ApiError(403, "This account is deactivated.");
  }
  if (user.suspendedAt) {
    throw new ApiError(403, `This account is suspended${user.suspensionReason ? `: ${user.suspensionReason}` : "."}`);
  }

  if ((payload.authVersion ?? 0) !== (user.authVersion || 0) || (
    payload.authVersion === undefined && user.passwordChangedAt &&
    (!payload.iat || payload.iat * 1000 < user.passwordChangedAt.getTime())
  )) {
    throw new ApiError(401, "Your account credentials changed. Please log in again.");
  }

  req.user = user;
  next();
});

export const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(
      new ApiError(403, "You do not have permission to perform this action."),
    );
  }

  return next();
};
