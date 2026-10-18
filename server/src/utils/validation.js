import mongoose from "mongoose";
import ApiError from "./ApiError.js";

// Reject address-list and header syntax: account recovery must have one recipient.
const EMAIL_PATTERN = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/;

export function requireFields(body = {}, fields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be an object.");
  }
  const missingFields = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === "";
  });

  if (missingFields.length) {
    throw new ApiError(400, "Please provide all required fields.", {
      missingFields,
    });
  }
}

export function validateEmail(email) {
  if (String(email).length > 254 || !EMAIL_PATTERN.test(String(email).trim().toLowerCase())) {
    throw new ApiError(400, "Please provide a valid email address.");
  }
}

export function validateObjectId(value, fieldName = "id") {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `Invalid ${fieldName}.`);
  }
}

export function toNonNegativeNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new ApiError(400, `${fieldName} must be a non-negative number.`);
  }

  return number;
}

export function pick(source, allowedFields) {
  return allowedFields.reduce((result, field) => {
    if (source[field] !== undefined) result[field] = source[field];
    return result;
  }, {});
}
