const router = require("express").Router();
const ctrl = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { registerLimiter, authLimiter, otpLimiter } = require("../middleware/rateLimiter");
const {
  check,
  registerRules,
  loginRules,
  forgotPasswordRules,
  verifyOtpRules,
  resetPasswordRules,
  changePasswordRules
} = require("../middleware/validate");

router.post("/register", registerLimiter, registerRules, check, ctrl.register);
router.post("/login", authLimiter, loginRules, check, ctrl.login);
router.get("/me", protect, ctrl.me);
router.put("/change-password", protect, changePasswordRules, check, ctrl.changePassword);
router.put("/reset-password", protect, changePasswordRules, check, ctrl.changePassword);
router.post("/forgot-password", otpLimiter, forgotPasswordRules, check, ctrl.forgotPassword);
router.post("/verify-otp", otpLimiter, verifyOtpRules, check, ctrl.verifyOtp);
router.post("/reset-password-by-otp", otpLimiter, resetPasswordRules, check, ctrl.resetPasswordWithOtp);

router.get("/family-members", protect, ctrl.getFamilyMembers);
router.post("/family-members", protect, ctrl.addFamilyMember);
router.put("/family-members/:memberId", protect, ctrl.updateFamilyMember);
router.delete("/family-members/:memberId", protect, ctrl.deleteFamilyMember);

module.exports = router;
