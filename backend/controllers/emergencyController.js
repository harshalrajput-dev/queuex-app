const EmergencyAlert = require("../models/EmergencyAlert");
const User = require("../models/User");
const { ok, fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");
const logger = require("../services/logger");
const eventHub = require("../services/eventHub");
const { generateEmergencyPass } = require("../utils/emergencyPassPDF");
const { calcDistanceAndETA } = require("../utils/distance");

const SEVERITY_LABELS = {
  MODERATE: "Moderate / Stable",
  SERIOUS: "Serious / Urgent",
  CRITICAL: "Critical / Severe"
};

const COOLDOWN_DAYS = 3;

exports.triggerSOS = ah(async (req, res) => {
  const patient = req.user;
  if (!patient || patient.role !== "PATIENT") {
    return fail(res, "Only patients can trigger an emergency SOS", 403);
  }

  const userDoc = await User.findById(patient._id);
  if (userDoc && userDoc.emergencyCoolDownUntil && new Date(userDoc.emergencyCoolDownUntil) > new Date()) {
    const remaining = Math.ceil((new Date(userDoc.emergencyCoolDownUntil) - new Date()) / (1000 * 60 * 60 * 24));
    return fail(res, `Emergency SOS is on cooldown. You can use it again in ${remaining} day(s).`, 403);
  }

  const active = await EmergencyAlert.findOne({ patientEmail: patient.email, status: "ACTIVE" });
  if (active) {
    return fail(res, "You already have an active emergency alert. Staff has been notified.", 409);
  }

  const {
    tokenId,
    severity,
    latitude,
    longitude,
    customAddress,
    alertFor,
    familyMemberId
  } = req.body || {};

  let familyMemberName = "";
  let alertPatientName = patient.name;
  if (alertFor && alertFor !== "self" && familyMemberId) {
    const userDoc = await User.findById(patient._id);
    const familyMember = (userDoc.familyMembers || []).find(
      (fm) => String(fm._id) === String(familyMemberId)
    );
    if (familyMember) {
      familyMemberName = familyMember.name;
      alertPatientName = `${patient.name} → ${familyMember.name}`;
    }
  }

  const validSeverity = ["MODERATE", "SERIOUS", "CRITICAL"].includes(severity) ? severity : "MODERATE";
  const lat = latitude != null ? Number(latitude) : null;
  const lng = longitude != null ? Number(longitude) : null;
  const address = (customAddress || "").trim();

  const { distanceKm, estimatedTravelMinutes, resolvedAddress } = calcDistanceAndETA(lat, lng, address);

  const displayAddress = address || resolvedAddress || "Unknown location";

  const alert = await EmergencyAlert.create({
    patientId: patient._id,
    patientName: alertPatientName,
    patientEmail: patient.email,
    patientMobile: patient.mobile || "",
    alertFor: alertFor || "self",
    familyMemberId: familyMemberId || "",
    familyMemberName: familyMemberName,
    tokenId: tokenId || "",
    severity: validSeverity,
    patientLocation: { lat, lng },
    customAddress: displayAddress,
    distanceKm,
    estimatedTravelMinutes,
    status: "ACTIVE",
    triggeredAt: new Date()
  });

  logger.warn("EMERGENCY", `SOS triggered by ${alertPatientName} (${patient.email}) Severity: ${validSeverity} Distance: ${distanceKm}km ETA: ${estimatedTravelMinutes}min`);

  eventHub.broadcast("emergency.triggered", {
    alertId: String(alert._id),
    patientName: alertPatientName,
    patientMobile: patient.mobile || "",
    patientEmail: patient.email,
    alertFor: alertFor || "self",
    familyMemberName: familyMemberName,
    tokenId: tokenId || "",
    severity: validSeverity,
    severityLabel: SEVERITY_LABELS[validSeverity],
    customAddress: displayAddress,
    distanceKm,
    estimatedTravelMinutes,
    triggeredAt: alert.triggeredAt.toISOString()
  });

  return ok(res, {
    alertId: alert._id,
    status: "ACTIVE",
    severity: validSeverity,
    severityLabel: SEVERITY_LABELS[validSeverity],
    distanceKm,
    estimatedTravelMinutes,
    customAddress: displayAddress,
    message: "Emergency SOS sent. Hospital staff has been notified."
  }, "Emergency SOS triggered", 201);
});

exports.getActiveAlerts = ah(async (req, res) => {
  const alerts = await EmergencyAlert.find({ status: "ACTIVE" }).sort({ triggeredAt: -1 });
  return ok(res, alerts, "Active emergency alerts");
});

exports.confirmEmergency = ah(async (req, res) => {
  const { alertId, roomNumber, ambulanceNumber, instructions } = req.body || {};

  if (!alertId) {
    return fail(res, "alertId is required", 400);
  }
  if (!roomNumber || !String(roomNumber).trim()) {
    return fail(res, "roomNumber is required", 400);
  }

  const alert = await EmergencyAlert.findById(alertId);
  if (!alert) {
    return fail(res, "Emergency alert not found", 404);
  }
  if (alert.status === "CONFIRMED") {
    return fail(res, "This alert has already been confirmed", 409);
  }
  if (alert.status === "DISMISSED") {
    return fail(res, "This alert was dismissed and cannot be confirmed", 409);
  }

  alert.status = "CONFIRMED";
  alert.roomNumber = String(roomNumber).trim();
  alert.ambulanceNumber = (ambulanceNumber || "").trim();
  alert.instructions = (instructions || "").trim();
  alert.confirmedAt = new Date();
  alert.confirmedBy = req.user ? req.user.email : "unknown";
  await alert.save();

  logger.warn("EMERGENCY", `Alert for ${alert.patientName} CONFIRMED by ${alert.confirmedBy} → Room ${alert.roomNumber}`);

  eventHub.broadcast("emergency.confirmed", {
    alertId: String(alert._id),
    patientName: alert.patientName,
    patientEmail: alert.patientEmail,
    patientMobile: alert.patientMobile,
    tokenId: alert.tokenId,
    severity: alert.severity,
    severityLabel: SEVERITY_LABELS[alert.severity],
    customAddress: alert.customAddress,
    distanceKm: alert.distanceKm,
    estimatedTravelMinutes: alert.estimatedTravelMinutes,
    roomNumber: alert.roomNumber,
    ambulanceNumber: alert.ambulanceNumber,
    instructions: alert.instructions,
    confirmedAt: alert.confirmedAt.toISOString(),
    confirmedBy: alert.confirmedBy
  });

  return ok(res, {
    alertId: alert._id,
    status: "CONFIRMED",
    roomNumber: alert.roomNumber,
    message: `Emergency confirmed. Patient assigned to Room ${alert.roomNumber}. Digital pass is now available for download.`
  }, "Emergency confirmed");
});

exports.admitEmergency = ah(async (req, res) => {
  const { alertId } = req.body || {};
  const { onEmergencyAdmitted } = require("../controllers/wardController");

  if (!alertId) {
    return fail(res, "alertId is required", 400);
  }

  const alert = await EmergencyAlert.findById(alertId);
  if (!alert) {
    return fail(res, "Emergency alert not found", 404);
  }
  if (alert.status === "ADMITTED") {
    return fail(res, "This patient has already been admitted", 409);
  }
  if (alert.status !== "CONFIRMED") {
    return fail(res, "Can only admit patients from CONFIRMED status", 400);
  }

  alert.status = "ADMITTED";
  alert.admittedAt = new Date();
  alert.admittedBy = req.user ? req.user.email : "unknown";
  await alert.save();

  const coolDownUntil = new Date();
  coolDownUntil.setDate(coolDownUntil.getDate() + COOLDOWN_DAYS);

  if (alert.patientId) {
    await User.findByIdAndUpdate(alert.patientId, {
      emergencyCoolDownUntil: coolDownUntil
    });
  }

  await onEmergencyAdmitted(alert);

  logger.warn("EMERGENCY", `Alert for ${alert.patientName} ADMITTED by ${alert.admittedBy}. Cooldown until ${coolDownUntil.toISOString()}`);

  eventHub.broadcast("emergency.admitted", {
    alertId: String(alert._id),
    patientName: alert.patientName,
    patientEmail: alert.patientEmail,
    admittedAt: alert.admittedAt.toISOString(),
    admittedBy: alert.admittedBy,
    coolDownUntil: coolDownUntil.toISOString()
  });

  return ok(res, {
    alertId: alert._id,
    status: "ADMITTED",
    coolDownUntil: coolDownUntil.toISOString(),
    message: `Patient ${alert.patientName} admitted successfully. Emergency SOS button locked for 3 days.`
  }, "Emergency admitted");
});

exports.checkCooldown = ah(async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return ok(res, { onCooldown: false, coolDownUntil: null });
  }
  const user = await User.findOne({ email });
  if (!user) {
    return ok(res, { onCooldown: false, coolDownUntil: null });
  }
  const now = new Date();
  const isOnCooldown = user.emergencyCoolDownUntil && new Date(user.emergencyCoolDownUntil) > now;
  return ok(res, {
    onCooldown: isOnCooldown,
    coolDownUntil: user.emergencyCoolDownUntil || null,
    remainingMs: isOnCooldown ? new Date(user.emergencyCoolDownUntil).getTime() - now.getTime() : 0
  }, "Cooldown status");
});

exports.getPass = ah(async (req, res) => {
  const { id } = req.params;

  const alert = await EmergencyAlert.findById(id);
  if (!alert) {
    return fail(res, "Emergency alert not found", 404);
  }
  if (alert.status !== "CONFIRMED" && alert.status !== "ADMITTED") {
    return fail(res, "Emergency pass is only available after confirmation", 400);
  }

  const pdfBuffer = await generateEmergencyPass(alert);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="emergency-pass-${alert.tokenId || "pass"}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  return res.send(pdfBuffer);
});

exports.dismissAlert = ah(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const alert = await EmergencyAlert.findById(id);
  if (!alert) {
    return fail(res, "Emergency alert not found", 404);
  }
  if (alert.status === "DISMISSED") {
    return fail(res, "This alert has already been dismissed", 409);
  }

  alert.status = "DISMISSED";
  alert.dismissedBy = req.user ? req.user.email : "unknown";
  alert.dismissedAt = new Date();
  alert.dismissReason = reason || "False alarm";
  await alert.save();

  logger.warn("EMERGENCY", `Alert for ${alert.patientName} dismissed by ${alert.dismissedBy}: ${alert.dismissReason}`);

  eventHub.broadcast("emergency.dismissed", {
    alertId: String(alert._id),
    patientName: alert.patientName,
    dismissedBy: alert.dismissedBy,
    dismissReason: alert.dismissReason
  });

  return ok(res, { alertId: alert._id, status: "DISMISSED" }, "Emergency alert dismissed");
});

exports.getConfirmedHistory = ah(async (req, res) => {
  const alerts = await EmergencyAlert.find({ status: { $in: ["CONFIRMED", "ADMITTED"] } }).sort({ confirmedAt: -1 });
  return ok(res, alerts, "Confirmed emergency history");
});

exports.checkActive = ah(async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return ok(res, { hasActive: false });
  }
  const active = await EmergencyAlert.findOne({ patientEmail: email, status: "ACTIVE" });
  const confirmed = await EmergencyAlert.findOne({ patientEmail: email, status: { $in: ["CONFIRMED", "ADMITTED"] } }).sort({ confirmedAt: -1 });
  return ok(res, {
    hasActive: !!active,
    alertId: active ? active._id : null,
    triggeredAt: active ? active.triggeredAt : null,
    confirmedAlert: confirmed ? {
      alertId: confirmed._id,
      roomNumber: confirmed.roomNumber,
      ambulanceNumber: confirmed.ambulanceNumber,
      instructions: confirmed.instructions,
      confirmedAt: confirmed.confirmedAt,
      severity: confirmed.severity,
      severityLabel: SEVERITY_LABELS[confirmed.severity],
      customAddress: confirmed.customAddress,
      distanceKm: confirmed.distanceKm,
      estimatedTravelMinutes: confirmed.estimatedTravelMinutes
    } : null
  });
});
