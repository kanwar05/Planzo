import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import RefreshToken from "../models/RefreshToken.js";
import EmailOtp from "../models/EmailOtp.js";
import Booking from "../models/Booking.js";
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
import { requireFields, validateEmail } from "../utils/validation.js";
import {
  sendEmailChange,
  sendPasswordReset,
} from "../services/accountEmailService.js";
import { sendLoginOtp } from "../services/otpEmailService.js";
import { activeAccountFilter, isActiveAccount } from "../utils/accountEligibility.js";
import { withBookingTransaction, lockAccountForBooking, lockVendorForBooking } from "../utils/vendorBookingTransaction.js";
import { logEvent } from "../utils/logger.js";

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const OTP_EXPIRY_MS = Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000;
const OTP_COOLDOWN_MS =
  Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ACTIVE_ACCOUNT = activeAccountFilter();
const credentialTokenFields = {
  passwordResetTokenHash: 1,
  passwordResetExpiresAt: 1,
  pendingEmail: 1,
  emailChangeTokenHash: 1,
  emailChangeExpiresAt: 1,
};

export function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function textField(body, field) {
  if (typeof body[field] !== "string") {
    throw new ApiError(400, `${field} must be a string.`);
  }
  return body[field].trim();
}

function validateProfile(name, phone) {
  if (name.length < 2 || name.length > 80) {
    throw new ApiError(400, "Name must be between 2 and 80 characters.");
  }
  if (!/^[+()\d\s.\-]{7,20}$/.test(phone)) {
    throw new ApiError(
      400,
      "Provide a valid phone number between 7 and 20 characters.",
    );
  }
}

function passwordField(body, field) {
  if (typeof body[field] !== "string") {
    throw new ApiError(400, `${field} must be a string.`);
  }
  return body[field];
}

function validatePasswordStrength(password) {
  const problems = [];
  if (password.length < 8) problems.push("at least 8 characters");
  if (!/[a-z]/.test(password)) problems.push("one lowercase letter");
  if (!/[A-Z]/.test(password)) problems.push("one uppercase letter");
  if (!/\d/.test(password)) problems.push("one number");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("one special character");
  if (problems.length) {
    throw new ApiError(400, `Password must include ${problems.join(", ")}.`);
  }
  // bcrypt only considers the first 72 bytes; never silently truncate a password.
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new ApiError(400, "Password cannot exceed 72 bytes.");
  }
}

function assertActive(user) {
  if (user.accountStatus === "deactivated") {
    throw new ApiError(
      403,
      "This account is deactivated. Contact support to reactivate it.",
    );
  }
  if (user.suspendedAt) throw new ApiError(403, "This account is suspended.");
  if (["blocked", "suspended"].includes(user.accountStatus))
    throw new ApiError(403, "This account is unavailable.");
  if (!isActiveAccount(user)) throw new ApiError(403, "This account is unavailable.");
}

function versionFilter(user) {
  const version = user.authVersion || 0;
  return version === 0
    ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
    : { authVersion: version };
}

async function createRefreshToken(user) {
  const refreshToken = createOpaqueToken();
  await RefreshToken.create({
    userId: user._id,
    authVersion: user.authVersion || 0,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiryDate(),
  });
  return refreshToken;
}

export async function startSession(res, user, statusCode, message) {
  const accessToken = generateAccessToken(user._id, user.authVersion || 0);
  const refreshToken = await createRefreshToken(user);
  setAuthCookies(res, { accessToken, refreshToken });
  res
    .status(statusCode)
    .json({ success: true, message, user: serializeUser(user) });
}

function getRefreshTokenFromRequest(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || "";
}

export async function revokeAllUserRefreshTokens(userId, session = null) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { revokedAt: new Date() },
  ).session(session);
}

function readCredentialToken(body, message) {
  const token = textField(body, "token");
  if (!/^[a-f0-9]{96}$/i.test(token)) throw new ApiError(400, message);
  return token;
}

function otpHash(code) {
  const secret = process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new ApiError(503, "OTP authentication is not configured.");
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export const requestLoginOtp = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email"]);
  const email = textField(req.body, "email").toLowerCase();
  validateEmail(email);
  const response = {
    success: true,
    message: "If an eligible account exists, a sign-in code has been sent.",
  };
  const recent = await EmailOtp.findOne({
    email,
    consumedAt: null,
    requestedAt: { $gt: new Date(Date.now() - OTP_COOLDOWN_MS) },
  });
  if (recent) return res.status(200).json(response);
  const user = await User.findOne({ email, ...ACTIVE_ACCOUNT });
  if (!user || user.role === "admin") return res.status(200).json(response);
  const code = generateOtp();
  let issued;
  try {
    // One deterministic challenge per account uses the existing unique _id.
    // Concurrent issuers either replace an old challenge or lose the upsert to
    // that key; the loser keeps the same generic response and sends no email.
    issued = await EmailOtp.findOneAndUpdate({
      _id: user._id,
      $or: [
        { requestedAt: { $lte: new Date(Date.now() - OTP_COOLDOWN_MS) } },
        { requestedAt: { $exists: false } },
        { consumedAt: { $ne: null } },
      ],
    }, { $set: {
      email, codeHash: otpHash(code), attempts: 0, consumedAt: null,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS), requestedAt: new Date(),
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?._id)
      return res.status(200).json(response);
    throw error;
  }
  // Preserve compatibility with older randomly keyed challenges. Only the
  // winner of the conditional issue can invalidate these prior active codes.
  await EmailOtp.deleteMany({ email, consumedAt: null, _id: { $ne: user._id } });
  try {
    await sendLoginOtp({ email, code });
  } catch {
    await EmailOtp.deleteMany({ _id: issued._id, codeHash: issued.codeHash, requestedAt: issued.requestedAt });
    logEvent("error", "auth_email_delivery_failed", { category: "otp" });
    throw new ApiError(
      503,
      "Sign-in code could not be sent. Please try again later.",
    );
  }
  return res.status(200).json(response);
});

export const verifyLoginOtp = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "code"]);
  const email = textField(req.body, "email").toLowerCase();
  const code = textField(req.body, "code");
  validateEmail(email);
  if (!/^\d{6}$/.test(code))
    throw new ApiError(400, "Sign-in code must be six digits.");
  const otp = await EmailOtp.findOne({
    email,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ requestedAt: -1, _id: -1 });
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(401, "The sign-in code is invalid or expired.");
  }
  // Claim an attempt before comparing the code. A read-then-increment counter
  // lets parallel guesses all pass the budget check against the same snapshot.
  const attempted = await EmailOtp.findOneAndUpdate({
    _id: otp._id, codeHash: otp.codeHash, consumedAt: null,
    ...(otp.requestedAt ? { requestedAt: otp.requestedAt } : {}),
    expiresAt: { $gt: new Date() },
    $or: [{ attempts: { $gte: 0, $lt: OTP_MAX_ATTEMPTS } }, { attempts: { $exists: false } }],
  }, { $inc: { attempts: 1 } }, { new: true });
  if (!attempted || typeof attempted.codeHash !== "string" || !/^[a-f0-9]{64}$/i.test(attempted.codeHash) ||
    !crypto.timingSafeEqual(Buffer.from(attempted.codeHash), Buffer.from(otpHash(code)))) {
    throw new ApiError(401, "The sign-in code is invalid or expired.");
  }
  const user = await User.findOne({
    email,
    ...ACTIVE_ACCOUNT,
    role: { $in: ["customer", "vendor"] },
  });
  if (!user) throw new ApiError(401, "The sign-in code is invalid or expired.");
  const consumed = await EmailOtp.findOneAndUpdate(
    {
      _id: otp._id,
      codeHash: otp.codeHash,
      ...(otp.requestedAt ? { requestedAt: otp.requestedAt } : {}),
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { new: true },
  );
  if (!consumed) throw new ApiError(401, "The sign-in code is invalid or expired.");
  await startSession(res, user, 200, "Logged in successfully.");
});

export const register = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "email", "phone", "password"]);
  const name = textField(req.body, "name");
  const email = textField(req.body, "email").toLowerCase();
  const phone = textField(req.body, "phone");
  const password = passwordField(req.body, "password");
  const role = req.body.role || "customer";
  validateEmail(email);
  validateProfile(name, phone);
  validatePasswordStrength(password);
  if (!["customer", "vendor"].includes(role)) {
    throw new ApiError(
      400,
      "Public registration supports customer or vendor accounts only.",
    );
  }
  if (await User.exists({ email })) {
    throw new ApiError(409, "An account with this email already exists.");
  }
  const user = await User.create({ name, email, phone, password, role });
  await startSession(res, user, 201, "Account created successfully.");
});

export const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);
  const email = textField(req.body, "email").toLowerCase();
  const password = passwordField(req.body, "password");
  validateEmail(email);
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password.");
  }
  assertActive(user);
  await startSession(res, user, 200, "Logged in successfully.");
});

export const refresh = asyncHandler(async (req, res) => {
  const token = getRefreshTokenFromRequest(req);
  if (!token) throw new ApiError(401, "Refresh token is missing.");
  // Atomic consumption makes each refresh token usable once, including concurrent requests.
  const tokenRecord = await RefreshToken.findOneAndUpdate(
    {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date() } },
  );
  if (!tokenRecord) {
    clearAuthCookies(res);
    throw new ApiError(401, "Invalid or expired refresh token.");
  }
  const user = await User.findById(tokenRecord.userId);
  if (!user || (tokenRecord.authVersion || 0) !== (user.authVersion || 0)) {
    clearAuthCookies(res);
    throw new ApiError(
      401,
      "This session is no longer valid. Please log in again.",
    );
  }
  if (!isActiveAccount(user)) {
    await revokeAllUserRefreshTokens(user._id);
    clearAuthCookies(res);
    assertActive(user);
  }
  await startSession(res, user, 200, "Session refreshed successfully.");
});

export const logout = asyncHandler(async (req, res) => {
  const token = getRefreshTokenFromRequest(req);
  if (token) {
    await RefreshToken.updateOne(
      { tokenHash: hashToken(token), revokedAt: null },
      { revokedAt: new Date() },
    );
  }
  clearAuthCookies(res);
  res.status(200).json({ success: true, message: "Logged out successfully." });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email"]);
  const email = textField(req.body, "email").toLowerCase();
  validateEmail(email);
  const response = {
    success: true,
    message:
      "If an account exists for that email, password reset instructions have been sent.",
  };
  const user = await User.findOne({ email, ...ACTIVE_ACCOUNT });
  if (!user) return res.status(200).json(response);
  const resetToken = createOpaqueToken();
  const tokenHash = hashToken(resetToken);
  const issued = await User.updateOne(
    { _id: user._id, email, ...versionFilter(user), ...ACTIVE_ACCOUNT },
    {
      $set: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
      },
    },
  );
  if (!issued.matchedCount) return res.status(200).json(response);
  try {
    await sendPasswordReset({ user, token: resetToken });
  } catch {
    // Keep the response identical for existing and missing accounts. Never log reset links.
    await User.updateOne(
      { _id: user._id, passwordResetTokenHash: tokenHash },
      {
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      },
    );
    logEvent("error", "auth_email_delivery_failed", { category: "password_reset" });
  }
  return res.status(200).json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["token", "password"]);
  const token = readCredentialToken(
    req.body,
    "Password reset token is invalid or expired.",
  );
  const password = passwordField(req.body, "password");
  validatePasswordStrength(password);
  const passwordHash = await bcrypt.hash(password, 12);
  // Hash first, then consume the token and replace the password in one database operation.
  const user = await User.findOneAndUpdate(
    {
      passwordResetTokenHash: hashToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
      ...ACTIVE_ACCOUNT,
    },
    {
      $set: { password: passwordHash, passwordChangedAt: new Date() },
      $inc: { authVersion: 1 },
      $unset: credentialTokenFields,
    },
    { new: true },
  );
  if (!user)
    throw new ApiError(400, "Password reset token is invalid or expired.");
  await revokeAllUserRefreshTokens(user._id);
  clearAuthCookies(res);
  res
    .status(200)
    .json({
      success: true,
      message: "Password reset successfully. Please log in again.",
    });
});

export const updateProfile = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "phone"]);
  const name = textField(req.body, "name");
  const phone = textField(req.body, "phone");
  validateProfile(name, phone);
  if (
    req.body.email !== undefined &&
    textField(req.body, "email").toLowerCase() !== req.user.email
  ) {
    throw new ApiError(
      400,
      "Use email change verification to update your email address.",
    );
  }
  req.user.name = name;
  req.user.phone = phone;
  await req.user.save();
  res
    .status(200)
    .json({
      success: true,
      message: "Profile updated successfully.",
      user: serializeUser(req.user),
    });
});

export const requestEmailChange = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "currentPassword"]);
  const email = textField(req.body, "email").toLowerCase();
  validateEmail(email);
  const user = await User.findById(req.user._id).select("+password");
  if (
    !user ||
    !(await user.comparePassword(passwordField(req.body, "currentPassword")))
  ) {
    throw new ApiError(401, "Current password is incorrect.");
  }
  if (email === user.email)
    throw new ApiError(400, "Provide a different email address.");
  if (await User.exists({ email }))
    throw new ApiError(409, "An account with this email already exists.");
  const token = createOpaqueToken();
  const tokenHash = hashToken(token);
  const updated = await User.updateOne(
    { _id: user._id, ...versionFilter(user), ...ACTIVE_ACCOUNT },
    {
      $set: {
        pendingEmail: email,
        emailChangeTokenHash: tokenHash,
        emailChangeExpiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
      },
    },
  );
  if (!updated.matchedCount)
    throw new ApiError(401, "Your account changed. Please log in again.");
  try {
    await sendEmailChange({ user, email, token });
  } catch {
    await User.updateOne(
      { _id: user._id, emailChangeTokenHash: tokenHash },
      {
        $unset: {
          pendingEmail: 1,
          emailChangeTokenHash: 1,
          emailChangeExpiresAt: 1,
        },
      },
    );
    throw new ApiError(
      503,
      "Verification email could not be sent. Please try again later.",
    );
  }
  res
    .status(200)
    .json({
      success: true,
      message:
        "A verification link has been sent to your new email address. Your current email remains active until you confirm it.",
    });
});

export const confirmEmailChange = asyncHandler(async (req, res) => {
  requireFields(req.body, ["token"]);
  const token = readCredentialToken(
    req.body,
    "Email verification token is invalid or expired.",
  );
  const filter = {
    emailChangeTokenHash: hashToken(token),
    emailChangeExpiresAt: { $gt: new Date() },
    ...ACTIVE_ACCOUNT,
  };
  const pending = await User.findOne(filter).select("+pendingEmail");
  if (!pending?.pendingEmail)
    throw new ApiError(400, "Email verification token is invalid or expired.");
  const user = await User.findOneAndUpdate(
    { ...filter, _id: pending._id, ...versionFilter(pending) },
    {
      $set: { email: pending.pendingEmail },
      $inc: { authVersion: 1 },
      $unset: credentialTokenFields,
    },
    { new: true, runValidators: true },
  );
  if (!user)
    throw new ApiError(400, "Email verification token is invalid or expired.");
  await revokeAllUserRefreshTokens(user._id);
  clearAuthCookies(res);
  res
    .status(200)
    .json({
      success: true,
      message:
        "Email verified and updated. Please log in with your new email address.",
    });
});

export const changePassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["currentPassword", "newPassword"]);
  const user = await User.findById(req.user._id).select("+password");
  if (
    !user ||
    !(await user.comparePassword(passwordField(req.body, "currentPassword")))
  ) {
    throw new ApiError(401, "Current password is incorrect.");
  }
  const newPassword = passwordField(req.body, "newPassword");
  validatePasswordStrength(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await User.updateOne(
    { _id: user._id, ...versionFilter(user), ...ACTIVE_ACCOUNT },
    {
      $set: { password: passwordHash, passwordChangedAt: new Date() },
      $inc: { authVersion: 1 },
      $unset: credentialTokenFields,
    },
  );
  if (!result.matchedCount)
    throw new ApiError(401, "Your account changed. Please log in again.");
  await revokeAllUserRefreshTokens(user._id);
  clearAuthCookies(res);
  res
    .status(200)
    .json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  requireFields(req.body, ["password"]);
  const user = await User.findById(req.user._id).select("+password");
  if (
    !user ||
    !(await user.comparePassword(passwordField(req.body, "password")))
  ) {
    throw new ApiError(401, "Password is incorrect.");
  }
  if (user.role === "admin")
    throw new ApiError(
      403,
      "Administrator accounts must be managed by another administrator.",
    );
  await withBookingTransaction(async (session) => {
    await lockAccountForBooking(user._id, session);
    const vendor = await Vendor.findOne({ userId: user._id }).session(session);
    if (vendor) await lockVendorForBooking(vendor._id, session, user._id);
    const filter = vendor
      ? {
          $or: [{ customerId: user._id }, { vendorId: vendor._id }],
          status: { $in: ["pending", "accepted"] },
        }
      : { customerId: user._id, status: { $in: ["pending", "accepted"] } };
    if (await Booking.exists(filter).session(session)) {
      throw new ApiError(409, "Cancel or complete active bookings before deactivating your account.");
    }
    // Preserve users, vendor profiles and booking history; only access is deactivated.
    await User.updateOne(
      { _id: user._id },
      {
        $set: { accountStatus: "deactivated", deactivatedAt: new Date() },
        $inc: { authVersion: 1 },
        $unset: credentialTokenFields,
      },
    ).session(session);
    if (vendor) {
      await Vendor.updateOne({ _id: vendor._id }, {
        $set: { suspended: true, suspendedAt: new Date() },
        $inc: { profileRevision: 1 },
      }).session(session);
    }
    await revokeAllUserRefreshTokens(user._id, session);
  });
  clearAuthCookies(res);
  res
    .status(200)
    .json({
      success: true,
      message: "Account deactivated. Booking history has been retained.",
    });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: serializeUser(req.user) });
});
