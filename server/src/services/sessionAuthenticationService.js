import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { ACCESS_COOKIE_NAME } from "../utils/generateToken.js";
import { isActiveAccount } from "../utils/accountEligibility.js";

// Both HTTP and realtime connections use the existing access credential. A
// cookie takes precedence so a second credential cannot bypass its safeguards.
export function requestAccessToken(request, fallbackToken = "") {
  const authorization = request.headers?.authorization;
  const bearerToken = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim() : "";
  return request.cookies?.[ACCESS_COOKIE_NAME] || bearerToken || fallbackToken;
}

export async function authenticateAccessToken(token) {
  if (!token) throw new ApiError(401, "Authentication required.");
  if (!process.env.JWT_SECRET) throw new ApiError(500, "JWT authentication is not configured.");
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.type && payload.type !== "access") throw new Error("Invalid token type.");
  } catch {
    throw new ApiError(401, "Invalid or expired authentication token.");
  }
  if (!payload || typeof payload !== "object" || !/^[a-f0-9]{24}$/i.test(String(payload.id || "")))
    throw new ApiError(401, "Invalid or expired authentication token.");
  const user = await User.findById(payload.id);
  if (!user) throw new ApiError(401, "The user for this token no longer exists.");
  if (user.accountStatus === "deactivated") throw new ApiError(403, "This account is deactivated.");
  if (["blocked", "suspended"].includes(user.accountStatus)) throw new ApiError(403, "This account is unavailable.");
  if (user.suspendedAt)
    throw new ApiError(403, `This account is suspended${user.suspensionReason ? `: ${user.suspensionReason}` : "."}`);
  if (!isActiveAccount(user)) throw new ApiError(403, "This account is unavailable.");
  if ((payload.authVersion ?? 0) !== (user.authVersion || 0) ||
      (payload.authVersion === undefined && user.passwordChangedAt &&
        (!payload.iat || payload.iat * 1000 < user.passwordChangedAt.getTime())))
    throw new ApiError(401, "Your account credentials changed. Please log in again.");
  return { user, payload };
}
