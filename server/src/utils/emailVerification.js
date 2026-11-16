import ApiError from "./ApiError.js";

// A missing legacy value is not evidence of ownership. Only a valid persisted
// verification timestamp authorizes marketplace writes.
export function hasVerifiedEmail(user) {
  return user?.emailVerifiedAt instanceof Date &&
    Number.isFinite(user.emailVerifiedAt.getTime());
}

export function assertVerifiedEmail(user) {
  if (user?.role === "admin" || hasVerifiedEmail(user)) return;
  const error = new ApiError(403, "Verify your email address before using marketplace actions.");
  error.publicCode = "EMAIL_VERIFICATION_REQUIRED";
  throw error;
}
