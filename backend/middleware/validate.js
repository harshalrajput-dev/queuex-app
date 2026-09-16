const { body, validationResult } = require("express-validator");
const { fail } = require("../utils/response");

function check(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return fail(res, first.msg, 422);
  }
  next();
}

const VALID_STATUSES = [
  "PENDING_ASSISTANT",
  "CONFIRMED",
  "PATIENT_ARRIVED",
  "IN_TREATMENT",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "NO_SHOW"
];

const registerRules = [
  body("name").trim().isLength({ min: 2 }).withMessage("Full name is required"),
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("mobile").trim().isLength({ min: 10, max: 15 }).withMessage("Valid mobile number is required"),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
];

const loginRules = [
  body("email", "Email or mobile number is required").custom((value, { req }) => {
    return Boolean(value || (req.body && req.body.mobile));
  }),
  body("mobile", "Email or mobile number is required").custom((value, { req }) => {
    return Boolean(value || (req.body && req.body.email));
  }),
  body("password").notEmpty().withMessage("Password is required")
];

const forgotPasswordRules = [
  body("mobile", "Registered mobile or email is required").custom((value, { req }) => {
    return Boolean(value || req.body.email);
  })
];

const verifyOtpRules = [
  body("otp").trim().isLength({ min: 4, max: 6 }).withMessage("Valid OTP is required"),
  body("mobile", "Registered mobile or email is required").custom((value, { req }) => {
    return Boolean(value || req.body.email);
  })
];

const resetPasswordRules = [
  body("resetToken").notEmpty().withMessage("resetToken is required"),
  body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters")
];

const changePasswordRules = [
  body("currentPassword", "Current password is required").custom((value, { req }) => {
    return Boolean(value || req.body.currentPass);
  }),
  body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters")
];

const createBookingRules = [
  body("doctorName").trim().notEmpty().withMessage("Doctor is required"),
  body("slotTime").trim().notEmpty().withMessage("Time slot is required"),
  body("bookingDate").trim().isDate().withMessage("Valid booking date is required"),
  body("address").optional({ values: "falsy" }).trim().isLength({ max: 200 }).withMessage("Address is too long"),
  body("patientName", "Patient name is required for assistant-created tokens").optional({ values: "falsy" }).trim().isLength({ min: 2 }),
  body("patientEmail", "Patient email is required for assistant-created tokens").optional({ values: "falsy" }).isEmail()
];

const updateBookingRules = [
  body("status")
    .optional({ values: "falsy" })
    .isIn(VALID_STATUSES)
    .withMessage("Invalid booking status"),
  body("reschedule")
    .optional({ values: "falsy" })
    .isObject()
    .withMessage("Reschedule must be an object with a new date and slot"),
  body("reschedule.bookingDate")
    .optional({ values: "falsy" })
    .isDate()
    .withMessage("Valid reschedule date is required"),
  body("reschedule.slotTime")
    .optional({ values: "falsy" })
    .notEmpty()
    .withMessage("Reschedule time slot is required"),
  body("reason").optional({ values: "falsy" }).isString().withMessage("Reason must be text"),
  body("note").optional({ values: "falsy" }).isString().withMessage("Note must be text"),
  body("message").optional({ values: "falsy" }).isString().withMessage("Message must be text")
];

const doctorRules = [
  body("name").trim().isLength({ min: 2 }).withMessage("Doctor name is required"),
  body("department").trim().notEmpty().withMessage("Department is required")
];

const updateDoctorRules = [
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2 }).withMessage("Doctor name must be at least 2 characters")
];

const departmentRules = [
  body("name").trim().isLength({ min: 2 }).withMessage("Department name is required")
];

const updateDepartmentRules = [
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2 }).withMessage("Department name must be at least 2 characters")
];

module.exports = {
  check,
  registerRules,
  loginRules,
  forgotPasswordRules,
  verifyOtpRules,
  resetPasswordRules,
  changePasswordRules,
  createBookingRules,
  updateBookingRules,
  doctorRules,
  updateDoctorRules,
  departmentRules,
  updateDepartmentRules
};
