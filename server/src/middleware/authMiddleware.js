import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ACCESS_COOKIE_NAME } from "../utils/generateToken.js";

export const protect = asyncHandler(async (req, res, next) => {
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
    payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type && payload.type !== "access") {
      throw new Error("Invalid token type.");
    }
  } catch {
    throw new ApiError(401, "Invalid or expired authentication token.");
  }

  const user = await User.findById(payload.id);

  if (!user) {
    throw new ApiError(401, "The user for this token no longer exists.");
  }

  if (
    user.passwordChangedAt &&
    payload.iat * 1000 < user.passwordChangedAt.getTime()
  ) {
    throw new ApiError(401, "Password changed recently. Please log in again.");
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
