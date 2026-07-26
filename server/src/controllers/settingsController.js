import AccountSettings from "../models/AccountSettings.js";
import RefreshToken from "../models/RefreshToken.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  clearAuthCookies,
  hashToken,
  REFRESH_COOKIE_NAME,
} from "../utils/generateToken.js";

const sections = {
  notifications: ["bookingUpdates", "reviewReminders", "promotions", "productUpdates"],
  email: ["enabled", "bookingUpdates", "promotions", "newsletter"],
  sms: ["enabled", "bookingUpdates", "securityAlerts", "promotions"],
  privacy: ["profileVisibility", "showOnlineStatus", "allowSearchEngines", "dataPersonalization"],
  theme: ["mode", "reducedMotion"],
};

const getOrCreate = (userId) =>
  AccountSettings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreate(req.user._id);
  res.json({ success: true, settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const updates = {};
  for (const [section, fields] of Object.entries(sections)) {
    if (!req.body[section]) continue;
    for (const field of fields) {
      if (req.body[section][field] !== undefined) {
        updates[`${section}.${field}`] = req.body[section][field];
      }
    }
  }
  if (!Object.keys(updates).length) {
    throw new ApiError(400, "Provide at least one valid setting.");
  }

  const settings = await AccountSettings.findOneAndUpdate(
    { userId: req.user._id },
    { $set: updates, $setOnInsert: { userId: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  // Keep legacy notification consumers in sync.
  if (req.body.notifications) {
    const legacy = {};
    for (const key of ["bookingUpdates", "reviewReminders", "promotions"]) {
      if (req.body.notifications[key] !== undefined) {
        legacy[`notificationPreferences.${key}`] = req.body.notifications[key];
      }
    }
    if (Object.keys(legacy).length) await User.updateOne({ _id: req.user._id }, legacy);
  }

  res.json({ success: true, message: "Settings saved.", settings });
});

const currentTokenHash = (req) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  return token ? hashToken(token) : "";
};

export const listSessions = asyncHandler(async (req, res) => {
  const currentHash = currentTokenHash(req);
  const tokens = await RefreshToken.find({
    userId: req.user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ lastUsedAt: -1, createdAt: -1 });

  res.json({
    success: true,
    sessions: tokens.map((token) => ({
      id: token._id,
      device: token.device,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      current: token.tokenHash === currentHash,
    })),
  });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const token = await RefreshToken.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (!token) throw new ApiError(404, "Session not found.");
  if (token.tokenHash === currentTokenHash(req)) clearAuthCookies(res);
  res.json({ success: true, message: "Session signed out." });
});

export const revokeOtherSessions = asyncHandler(async (req, res) => {
  const currentHash = currentTokenHash(req);
  await RefreshToken.updateMany(
    { userId: req.user._id, tokenHash: { $ne: currentHash }, revokedAt: null },
    { revokedAt: new Date() },
  );
  res.json({ success: true, message: "Other sessions signed out." });
});

export const deactivateAccount = asyncHandler(async (req, res) => {
  if (!req.body.password) throw new ApiError(400, "Password is required.");
  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.comparePassword(String(req.body.password)))) {
    throw new ApiError(401, "Password is incorrect.");
  }
  user.accountStatus = "deactivated";
  user.deactivatedAt = new Date();
  await user.save({ validateBeforeSave: false });
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  clearAuthCookies(res);
  res.json({ success: true, message: "Account deactivated." });
});
