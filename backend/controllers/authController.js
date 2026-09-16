const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { ok, fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");
const logger = require("../services/logger");


const sanitizeUser = (user) => user.toSafeJSON();

exports.register = ah(async (req, res) => {
  const {
    name,
    email,
    mobile,
    bloodGroup,
    password,
    profilePhoto,
    medicalHistory,
    dob,
    gender,
    address,
    city,
    emergencyContact
  } = req.body;

  if (!name || !email || !mobile || !password) {
    return fail(res, "Name, email, mobile and password are required", 422);
  }
  if (String(password).length < 8) {
    return fail(res, "Password must be at least 8 characters", 422);
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { mobile: String(mobile).trim() }]
  });
  if (existing) {
    return fail(res, "User already exists with this email or mobile", 409);
  }

  const hashed = await bcrypt.hash(String(password), 10);
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    mobile: String(mobile).trim(),
    bloodGroup: bloodGroup || "Unknown",
    password: hashed,
    profilePhoto: profilePhoto || "",
    dob: dob || null,
    gender: gender || "",
    address: address || "",
    city: city || "",
    emergencyContact: emergencyContact || "",
    mobileVerified: process.env.DEV_OTP_MODE === "false" ? false : true,
    medicalHistory: medicalHistory || {}
  });

  logger.info("AUTH", `Patient registered: ${user.email}`);

  await Notification.create({
    userId: user._id,
    type: "ACCOUNT",
    title: "Registration successful",
    message: "Your QueueX patient account has been created."
  });

  return ok(res, null, "Registration successful!", 201);
});

exports.login = ah(async (req, res) => {
  const { email, mobile, password } = req.body;
  if ((!email && !mobile) || !password) {
    return fail(res, "Email/Mobile and password are required", 422);
  }

  const query = email
    ? { email: String(email).trim().toLowerCase() }
    : { mobile: String(mobile).trim() };
  const user = await User.findOne(query);
  if (!user) {
    return fail(res, "Invalid Credentials!", 400);
  }
  if (user.active === false) {
    return fail(res, "Account is disabled. Contact hospital admin.", 403);
  }

  const isMatch = await bcrypt.compare(String(password), user.password);
  if (!isMatch) {
    return fail(res, "Invalid Credentials!", 400);
  }

  user.lastLogin = new Date();
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
  logger.info("AUTH", `Login: ${user.email} (${user.role})`);

  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: sanitizeUser(user)
  });
});

exports.me = ah(async (req, res) => {
  return ok(res, sanitizeUser(req.user), "User profile");
});

exports.changePassword = ah(async (req, res) => {
  const { currentPass, currentPassword, newPass, newPassword } = req.body;
  const current = currentPass || currentPassword;
  const next = newPass || newPassword;

  if (!current || !next) {
    return fail(res, "Current and new password are required", 422);
  }
  if (String(next).length < 8) {
    return fail(res, "New password must be at least 8 characters", 422);
  }

  const isMatch = await bcrypt.compare(String(current), req.user.password);
  if (!isMatch) {
    return fail(res, "Current password is incorrect", 400);
  }

  req.user.password = await bcrypt.hash(String(next), 10);
  await req.user.save();
  logger.info("AUTH", `Password changed: ${req.user.email}`);
  return ok(res, null, "Password changed successfully");
});

exports.forgotPassword = ah(async (req, res) => {
  const { mobile, email } = req.body;
  const identifier = mobile || email;
  if (!identifier) {
    return fail(res, "Registered mobile or email is required", 422);
  }

  const query = email
    ? { email: String(identifier).trim().toLowerCase() }
    : { mobile: String(identifier).trim() };
  const user = await User.findOne(query);
  if (!user) {
    return fail(res, "No account found for this mobile/email", 404);
  }

  if (process.env.DEV_OTP_MODE === "false") {
    return fail(res, "SMS gateway is not configured yet. OTP cannot be sent.", 501);
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.otpCode = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  logger.info("AUTH", `OTP generated (development mode) for ${user.email}`);
  return ok(res, { devOtp: otp }, "OTP sent (development mode). Enter the OTP to continue.");
});

exports.verifyOtp = ah(async (req, res) => {
  const { mobile, email, otp } = req.body;
  if (!otp) {
    return fail(res, "OTP is required", 422);
  }
  const identifier = mobile || email;
  if (!identifier) {
    return fail(res, "Registered mobile or email is required", 422);
  }

  const query = email
    ? { email: String(identifier).trim().toLowerCase() }
    : { mobile: String(identifier).trim() };
  const user = await User.findOne(query);
  if (!user) {
    return fail(res, "No account found", 404);
  }
  if (!user.otpCode || user.otpCode !== String(otp).trim()) {
    return fail(res, "Invalid OTP", 400);
  }
  if (!user.otpExpires || user.otpExpires < new Date()) {
    return fail(res, "OTP has expired. Request a new one.", 400);
  }

  user.mobileVerified = true;
  user.otpCode = "";
  user.otpExpires = null;
  await user.save();

  const resetToken = jwt.sign(
    { id: user._id, purpose: "reset" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  return ok(res, { resetToken }, "OTP verified");
});

/* ---------- Family Members ---------- */

exports.getFamilyMembers = ah(async (req, res) => {
  const user = await User.findById(req.user._id).select("familyMembers");
  return ok(res, user.familyMembers || [], "Family members loaded");
});

exports.addFamilyMember = ah(async (req, res) => {
  const { name, age, relation, gender } = req.body;
  if (!name || age == null || !relation || !gender) {
    return fail(res, "Name, age, relation and gender are required", 422);
  }
  const validRelations = ["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Grandfather", "Grandmother", "Other"];
  if (!validRelations.includes(relation)) {
    return fail(res, "Invalid relation type", 422);
  }
  if (!["Male", "Female", "Other"].includes(gender)) {
    return fail(res, "Invalid gender", 422);
  }
  const user = await User.findById(req.user._id);
  if (!user) return fail(res, "User not found", 404);
  if (user.familyMembers && user.familyMembers.length >= 10) {
    return fail(res, "Maximum 10 family members allowed", 400);
  }
  user.familyMembers.push({ name: String(name).trim(), age: Number(age), relation, gender });
  await user.save();
  logger.info("FAMILY", `Family member "${name}" added for ${user.email}`);
  return ok(res, user.familyMembers, "Family member added", 201);
});

exports.updateFamilyMember = ah(async (req, res) => {
  const { memberId } = req.params;
  const { name, age, relation, gender } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return fail(res, "User not found", 404);
  const member = user.familyMembers.id(memberId);
  if (!member) return fail(res, "Family member not found", 404);
  if (name) member.name = String(name).trim();
  if (age != null) member.age = Number(age);
  if (relation) member.relation = relation;
  if (gender) member.gender = gender;
  await user.save();
  logger.info("FAMILY", `Family member "${member.name}" updated for ${user.email}`);
  return ok(res, user.familyMembers, "Family member updated");
});

exports.deleteFamilyMember = ah(async (req, res) => {
  const { memberId } = req.params;
  const user = await User.findById(req.user._id);
  if (!user) return fail(res, "User not found", 404);
  const member = user.familyMembers.id(memberId);
  if (!member) return fail(res, "Family member not found", 404);
  user.familyMembers.pull(memberId);
  await user.save();
  logger.info("FAMILY", `Family member removed for ${user.email}`);
  return ok(res, user.familyMembers, "Family member removed");
});

exports.resetPasswordWithOtp = ah(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return fail(res, "resetToken and newPassword are required", 422);
  }
  if (String(newPassword).length < 8) {
    return fail(res, "New password must be at least 8 characters", 422);
  }

  let decoded;
  try {
    decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch (err) {
    return fail(res, "Invalid or expired reset token", 400);
  }
  if (decoded.purpose !== "reset") {
    return fail(res, "Invalid reset token", 400);
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return fail(res, "Account not found", 404);
  }
  user.password = await bcrypt.hash(String(newPassword), 10);
  await user.save();
  logger.info("AUTH", `Password reset via OTP: ${user.email}`);
  return ok(res, null, "Password updated. You can login now.");
});
