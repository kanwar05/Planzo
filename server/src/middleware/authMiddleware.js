import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { assertVerifiedEmail } from "../utils/emailVerification.js";
import { authenticateAccessToken, requestAccessToken } from "../services/sessionAuthenticationService.js";

export const protect = asyncHandler(async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const { user } = await authenticateAccessToken(requestAccessToken(req));
  req.user = user;
  next();
});

export const authorizeRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action."),
      );
    }

    return next();
  };

export const requireVerifiedEmail = (req, res, next) => {
  try {
    assertVerifiedEmail(req.user);
    next();
  } catch (error) {
    next(error);
  }
};
