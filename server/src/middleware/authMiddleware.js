import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const protect = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required. Provide a Bearer token.");
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    throw new ApiError(401, "Authentication token is missing.");
  }

  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, "JWT authentication is not configured.");
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired authentication token.");
  }

  const user = await User.findById(payload.id);

  if (!user) {
    throw new ApiError(401, "The user for this token no longer exists.");
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
