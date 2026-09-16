const rateLimit = require("express-rate-limit");

const standard = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: message || "Too many requests, please try again later."
    }
  });

const authLimiter = standard(
  15 * 60 * 1000,
  30,
  "Too many login attempts. Please wait 15 minutes."
);

const registerLimiter = standard(
  60 * 60 * 1000,
  10,
  "Too many registration attempts from this IP. Please try later."
);

const bookingLimiter = standard(
  15 * 60 * 1000,
  40,
  "Too many booking requests. Please wait a while."
);

const otpLimiter = standard(
  15 * 60 * 1000,
  15,
  "Too many OTP requests. Please wait 15 minutes."
);

const generalLimiter = standard(
  15 * 60 * 1000,
  600,
  "Too many requests, please try again later."
);

module.exports = {
  authLimiter,
  registerLimiter,
  bookingLimiter,
  otpLimiter,
  generalLimiter
};
