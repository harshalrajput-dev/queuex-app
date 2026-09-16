const { fail } = require("../utils/response");
const logger = require("../services/logger");

const errorHandler = (err, req, res, next) => {
  logger.error("ERROR", err.message);

  if (err.code === 11000) {
    return fail(res, "Duplicate value. This record already exists.", 409);
  }
  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return fail(res, first ? first.message : "Validation failed", 422);
  }
  if (err.name === "CastError") {
    return fail(res, "Invalid identifier format", 400);
  }
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return fail(res, "Not authorized", 401);
  }
  if (err.statusCode) {
    return fail(res, err.message || "Request error", err.statusCode);
  }
  return fail(res, "Server error", 500);
};

const notFoundHandler = (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return fail(res, "API endpoint not found", 404);
  }
  next();
};

module.exports = { errorHandler, notFoundHandler };
