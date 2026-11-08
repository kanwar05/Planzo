import ApiError from "../utils/ApiError.js";
import { errorCategory, logEvent } from "../utils/logger.js";

export function notFound(req, res, next) {
  const error = new ApiError(404, "Route not found.");
  next(error);
}

export function errorHandler(error, req, res, next) {
  let statusCode = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 500;
  let message = error.message || "Internal server error.";
  let errors = error.errors;

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed.";
    errors = Object.fromEntries(
      Object.entries(error.errors || {}).map(([field, detail]) => [
        field,
        detail?.message || "Invalid value.",
      ]),
    );
  }

  if (error.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for ${error.path}.`;
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || "field";
    statusCode = 409;
    message = `A record with this ${field} already exists.`;
  }

  if (error.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body contains invalid JSON.";
  }

  if (error.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large.";
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = "Each business photo must be 5MB or smaller.";
  }

  if (
    error.code === "LIMIT_FILE_COUNT" ||
    error.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    statusCode = 400;
    message =
      error.code === "LIMIT_UNEXPECTED_FILE"
        ? "Unexpected image field or too many files for that field."
        : "Too many image files were uploaded.";
  }

  if (
    [
      "LIMIT_PART_COUNT",
      "LIMIT_FIELD_COUNT",
      "LIMIT_FIELD_KEY",
      "LIMIT_FIELD_VALUE",
    ].includes(error.code)
  ) {
    statusCode = 400;
    message = "The multipart upload contains too many fields.";
  }

  if (process.env.NODE_ENV === "production") {
    // Only application-authored ApiError messages are safe for 5xx responses.
    // Provider/network errors may themselves carry statusCode and private data.
    if (statusCode >= 500 && !(error instanceof ApiError)) message = "Internal server error.";
    const mappedClientError = ["ValidationError", "CastError"].includes(error.name) || error.code === 11000 ||
      ["entity.parse.failed", "entity.too.large"].includes(error.type) ||
      ["LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE", "LIMIT_PART_COUNT", "LIMIT_FIELD_COUNT", "LIMIT_FIELD_KEY", "LIMIT_FIELD_VALUE"].includes(error.code);
    if (statusCode < 500 && !(error instanceof ApiError) && !mappedClientError) {
      message = "Request could not be processed.";
      errors = undefined;
    }
    if (statusCode >= 500) errors = undefined;
    // Mongoose messages can echo rejected private values; retain field keys only.
    if (error.name === "ValidationError") errors = Object.fromEntries(Object.keys(error.errors || {}).map((field) => [field, "Invalid value."]));
  }
  if (statusCode >= 500) logEvent("error", "http_error", { requestId: req.requestId, statusCode, category: errorCategory(error) });

  const response = {
    success: false,
    message,
  };
  if (error.publicCode === "PHONE_AUTH_FAILED") response.code = error.publicCode;

  if (errors) response.errors = errors;
  if (process.env.NODE_ENV !== "production") response.stack = error.stack;

  res.status(statusCode).json(response);
}
