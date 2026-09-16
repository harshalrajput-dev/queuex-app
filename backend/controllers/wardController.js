const Ward = require("../models/Ward");
const Booking = require("../models/Booking");
const EmergencyAlert = require("../models/EmergencyAlert");
const { ok, fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");
const logger = require("../services/logger");
const eventHub = require("../services/eventHub");

exports.getWards = ah(async (req, res) => {
  const wards = await Ward.find({}).sort({ wardType: 1 });
  return ok(res, wards, "Ward occupancy data");
});

exports.getWardSummary = ah(async (req, res) => {
  const wards = await Ward.find({}).sort({ wardType: 1 });
  const totalBeds = wards.reduce((sum, w) => sum + w.totalBeds, 0);
  const availableBeds = wards.reduce((sum, w) => sum + w.availableBeds, 0);
  const occupiedBeds = wards.reduce((sum, w) => sum + w.occupiedBeds, 0);
  return ok(res, {
    wards,
    totalBeds,
    availableBeds,
    occupiedBeds,
    occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0
  }, "Ward summary");
});

exports.updateWardBeds = ah(async (req, res) => {
  const { wardId } = req.params;
  const { totalBeds, availableBeds } = req.body;
  const ward = await Ward.findById(wardId);
  if (!ward) return fail(res, "Ward not found", 404);
  if (totalBeds != null) ward.totalBeds = Number(totalBeds);
  if (availableBeds != null) {
    ward.availableBeds = Math.max(0, Math.min(Number(availableBeds), ward.totalBeds));
  }
  ward.occupiedBeds = ward.totalBeds - ward.availableBeds;
  ward.lastUpdated = new Date();
  await ward.save();
  eventHub.broadcast("ward.updated", { wardId: ward._id, availableBeds: ward.availableBeds, occupiedBeds: ward.occupiedBeds });
  return ok(res, ward, "Ward updated");
});

async function adjustBedCount(wardType, delta) {
  const ward = await Ward.findOne({ wardType });
  if (!ward) {
    logger.warn("WARD", `No ward found for type ${wardType}`);
    return;
  }
  ward.availableBeds = Math.max(0, Math.min(ward.totalBeds, ward.availableBeds + delta));
  ward.occupiedBeds = ward.totalBeds - ward.availableBeds;
  ward.lastUpdated = new Date();
  await ward.save();
  logger.info("WARD", `${ward.name}: available=${ward.availableBeds}, occupied=${ward.occupiedBeds} (delta: ${delta > 0 ? "+" : ""}${delta})`);
  eventHub.broadcast("ward.updated", {
    wardId: String(ward._id),
    wardName: ward.name,
    availableBeds: ward.availableBeds,
    occupiedBeds: ward.occupiedBeds,
    totalBeds: ward.totalBeds
  });
}

function inferWardType(deptName) {
  const dept = (deptName || "").toLowerCase();
  if (dept.includes("icu") || dept.includes("cardiac") || dept.includes("cardio")) return "ICU";
  if (dept.includes("emergency") || dept.includes("trauma") || dept.includes("surgery")) return "EMERGENCY_TRAUMA";
  return "GENERAL";
}

exports.onBookingStatusChange = async function onBookingStatusChange(booking, oldStatus, newStatus) {
  try {
    if (oldStatus === "PATIENT_ARRIVED" && newStatus === "COMPLETED") {
      const wardType = inferWardType(booking.doctorDept);
      await adjustBedCount(wardType, 1);
      logger.info("WARD", `Bed freed in ${wardType} ward (booking ${booking.tokenId} completed)`);
    } else if (oldStatus !== "PATIENT_ARRIVED" && newStatus === "PATIENT_ARRIVED") {
      const wardType = inferWardType(booking.doctorDept);
      await adjustBedCount(wardType, -1);
      logger.info("WARD", `Bed occupied in ${wardType} ward (booking ${booking.tokenId} arrived)`);
    }
  } catch (err) {
    logger.error("WARD", `Failed to adjust bed count: ${err.message}`);
  }
};

exports.onEmergencyAdmitted = async function onEmergencyAdmitted(alert) {
  try {
    await adjustBedCount("ICU", -1);
    logger.info("WARD", `Emergency admission → ICU bed occupied (${alert.patientName})`);
  } catch (err) {
    logger.error("WARD", `Failed to adjust emergency bed count: ${err.message}`);
  }
};

exports.onEmergencyDismissed = async function onEmergencyDismissed(alert) {
  try {
    if (alert.status === "CONFIRMED" || alert.status === "ADMITTED") {
      await adjustBedCount("ICU", 1);
      logger.info("WARD", `Emergency dismissed/admitted → ICU bed freed (${alert.patientName})`);
    }
  } catch (err) {
    logger.error("WARD", `Failed to adjust emergency bed count on dismiss: ${err.message}`);
  }
};

exports.seedWards = async function seedWards() {
  const count = await Ward.countDocuments();
  if (count === 0) {
    await Ward.insertMany([
      { name: "ICU", wardType: "ICU", description: "Intensive Care Unit - Critical care for life-threatening conditions", totalBeds: 20, availableBeds: 20, occupiedBeds: 0 },
      { name: "Emergency Trauma Care", wardType: "EMERGENCY_TRAUMA", description: "Emergency & Trauma Care - Urgent and accident cases", totalBeds: 30, availableBeds: 30, occupiedBeds: 0 },
      { name: "General Ward", wardType: "GENERAL", description: "General Ward - Standard inpatient care", totalBeds: 60, availableBeds: 60, occupiedBeds: 0 }
    ]);
    logger.warn("WARD", "Seeded 3 wards: ICU (20 beds), Emergency Trauma Care (30 beds), General Ward (60 beds)");
  }
};
