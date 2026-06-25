import RefreshToken from "../models/RefreshToken.js";
import Booking from "../models/Booking.js";
import Favorite from "../models/Favorite.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  clearAuthCookies,
  createOpaqueToken,
  generateAccessToken,
  getRefreshTokenExpiryDate,
  hashToken,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
} from "../utils/generateToken.js";
import { recalculateVendorRating } from "../utils/reviewRating.js";
import {
  requireFields,
  validateEmail,
} from "../utils/validation.js";

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    notificationPreferences: user.notificationPreferences,
    createdAt: user.createdAt,
  };
}

function validatePasswordStrength(password) {
  const value = String(password);
  const problems = [];

  if (value.length < 8) problems.push("at least 8 characters");
  if (!/[a-z]/.test(value)) problems.push("one lowercase letter");
  if (!/[A-Z]/.test(value)) problems.push("one uppercase letter");
  if (!/\d/.test(value)) problems.push("one number");
  if (!/[^A-Za-z0-9]/.test(value)) problems.push("one special character");

  if (problems.length) {
    throw new ApiError(
      400,
      `Password must include ${problems.join(", ")}.`,
    );
  }
}

async function createRefreshToken(userId) {
  const refreshToken = createOpaqueToken();
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiryDate(),
  });

  return refreshToken;
}

async function startSession(res, user, statusCode, message) {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = await createRefreshToken(user._id);

  setAuthCookies(res, { accessToken, refreshToken });

  res.status(statusCode).json({
    success: true,
    message,
    user: serializeUser(user),
  });
}

function getRefreshTokenFromRequest(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || "";
}

async function revokeRefreshToken(token) {
  if (!token) return;

  await RefreshToken.findOneAndUpdate(
    {
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    { revokedAt: new Date() },
  );
}

async function revokeAllUserRefreshTokens(userId) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { revokedAt: new Date() },
  );
}

export const register = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "phone", "password"]);

  const name = String(req.body.name).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const phone = String(req.body.phone).trim();
  const password = String(req.body.password);
  const role = req.body.role || "customer";

  validateEmail(email);
  validatePasswordStrength(password);

  if (!["customer", "vendor"].includes(role)) {
    throw new ApiError(
      400,
      "Public registration supports customer or vendor accounts only.",
    );
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const user = await User.create({ name, email, phone, password, role });
  await startSession(res, user, 201, "Account created successfully.");
});

export const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);

  const email = String(req.body.email).trim().toLowerCase();
  validateEmail(email);

  const user = await User.findOne({ email }).select("+password");
  const passwordMatches =
    user && (await user.comparePassword(String(req.body.password)));

  if (!user || !passwordMatches) {
    throw new ApiError(401, "Invalid email or password.");
  }

  await startSession(res, user, 200, "Logged in successfully.");
});

export const refresh = asyncHandler(async (req, res) => {
  const currentRefreshToken = getRefreshTokenFromRequest(req);
  if (!currentRefreshToken) {
    throw new ApiError(401, "Refresh token is missing.");
  }

  const tokenRecord = await RefreshToken.findOne({
    tokenHash: hashToken(currentRefreshToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!tokenRecord) {
    clearAuthCookies(res);
    throw new ApiError(401, "Invalid or expired refresh token.");
  }

  const user = await User.findById(tokenRecord.userId);
  if (!user) {
    tokenRecord.revokedAt = new Date();
    await tokenRecord.save();
    clearAuthCookies(res);
    throw new ApiError(401, "The user for this token no longer exists.");
  }

  tokenRecord.revokedAt = new Date();
  await tokenRecord.save();

  const accessToken = generateAccessToken(user._id);
  const refreshToken = await createRefreshToken(user._id);
  setAuthCookies(res, { accessToken, refreshToken });

  res.status(200).json({
    success: true,
    message: "Session refreshed successfully.",
    user: serializeUser(user),
  });
});

export const logout = asyncHandler(async (req, res) => {
  await revokeRefreshToken(getRefreshTokenFromRequest(req));
  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email"]);

  const email = String(req.body.email).trim().toLowerCase();
  validateEmail(email);

  const user = await User.findOne({ email }).select(
    "+passwordResetTokenHash +passwordResetExpiresAt",
  );

  const response = {
    success: true,
    message:
      "If an account exists for that email, password reset instructions have been sent.",
  };

  if (!user) {
    return res.status(200).json(response);
  }

  const resetToken = createOpaqueToken();
  user.passwordResetTokenHash = hashToken(resetToken);
  user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  if (process.env.NODE_ENV !== "production") {
    response.resetToken = resetToken;
  }

  return res.status(200).json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["token", "password"]);

  const password = String(req.body.password);
  validatePasswordStrength(password);

  const user = await User.findOne({
    passwordResetTokenHash: hashToken(String(req.body.token)),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt");

  if (!user) {
    throw new ApiError(400, "Password reset token is invalid or expired.");
  }

  user.password = password;
  user.passwordChangedAt = new Date();
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: "Password reset successfully. Please log in again.",
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "phone"]);

  const name = String(req.body.name).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const phone = String(req.body.phone).trim();

  validateEmail(email);

  if (name.length < 2 || name.length > 80) {
    throw new ApiError(400, "Name must be between 2 and 80 characters.");
  }
  if (phone.length < 7 || phone.length > 20) {
    throw new ApiError(400, "Phone number must be between 7 and 20 characters.");
  }

  const existingUser = await User.findOne({
    email,
    _id: { $ne: req.user._id },
  });
  if (existingUser) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  req.user.name = name;
  req.user.email = email;
  req.user.phone = phone;
  await req.user.save();

  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    user: serializeUser(req.user),
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["currentPassword", "newPassword"]);

  const user = await User.findById(req.user._id).select("+password");
  const passwordMatches = await user.comparePassword(
    String(req.body.currentPassword),
  );

  if (!passwordMatches) {
    throw new ApiError(401, "Current password is incorrect.");
  }

  const newPassword = String(req.body.newPassword);
  validatePasswordStrength(newPassword);

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  await revokeAllUserRefreshTokens(user._id);
  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: "Password changed successfully. Please log in again.",
  });
});

export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const allowedFields = ["bookingUpdates", "reviewReminders", "promotions"];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[`notificationPreferences.${field}`] = Boolean(req.body[field]);
    }
  }

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "Provide at least one notification preference.");
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    message: "Notification preferences updated.",
    user: serializeUser(user),
  });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  requireFields(req.body, ["password"]);

  const user = await User.findById(req.user._id).select("+password");
  const passwordMatches = await user.comparePassword(String(req.body.password));

  if (!passwordMatches) {
    throw new ApiError(401, "Password is incorrect.");
  }

  const vendor = await Vendor.findOne({ userId: user._id });
  const activeBookingFilter = vendor
    ? {
        $or: [
          { customerId: user._id, status: { $in: ["pending", "accepted"] } },
          { vendorId: vendor._id, status: { $in: ["pending", "accepted"] } },
        ],
      }
    : { customerId: user._id, status: { $in: ["pending", "accepted"] } };

  const activeBookings = await Booking.exists(activeBookingFilter);
  if (activeBookings) {
    throw new ApiError(
      409,
      "Cancel or complete active bookings before deleting your account.",
    );
  }

  const reviews = await Review.find({ customerId: user._id }).select("vendorId");
  const affectedVendorIds = [
    ...new Set(reviews.map((review) => String(review.vendorId))),
  ];

  await Promise.all([
    Favorite.deleteMany({ customerId: user._id }),
    Review.deleteMany({ customerId: user._id }),
    Booking.deleteMany({ customerId: user._id, status: { $nin: ["pending", "accepted"] } }),
    revokeAllUserRefreshTokens(user._id),
  ]);

  await Promise.all(
    affectedVendorIds.map((vendorId) => recalculateVendorRating(vendorId)),
  );

  await user.deleteOne();
  clearAuthCookies(res);

  res.status(200).json({
    success: true,
    message: "Account deleted successfully.",
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: serializeUser(req.user),
  });
});
