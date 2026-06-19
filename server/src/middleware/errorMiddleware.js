export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal server error.";
  let errors = error.errors;

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed.";
    errors = Object.fromEntries(
      Object.entries(error.errors).map(([field, detail]) => [
        field,
        detail.message,
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

  const response = {
    success: false,
    message,
  };

  if (errors) response.errors = errors;
  if (process.env.NODE_ENV !== "production") response.stack = error.stack;

  res.status(statusCode).json(response);
}
