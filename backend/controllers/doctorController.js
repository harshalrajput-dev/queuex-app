const Doctor = require("../models/Doctor");
const { ok, fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");
const logger = require("../services/logger");
const eventHub = require("../services/eventHub");

exports.listDoctors = ah(async (req, res) => {
  const { department, active } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (active === "1" || active === "true") filter.isActive = true;
  const doctors = await Doctor.find(filter).sort({ department: 1, name: 1 });
  return ok(res, doctors, "Doctors list");
});

exports.getDoctor = ah(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) return fail(res, "Doctor not found", 404);
  return ok(res, doctor);
});

exports.createDoctor = ah(async (req, res) => {
  const doctor = await Doctor.create(req.body);
  logger.info("ADMIN", `Doctor created: ${doctor.name}`);
  return ok(res, doctor, "Doctor created", 201);
});

exports.updateDoctor = ah(async (req, res) => {
  const doctor = await Doctor.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doctor) return fail(res, "Doctor not found", 404);
  logger.info("ADMIN", `Doctor updated: ${doctor.name}`);
  eventHub.broadcast("board.updated", { reason: "doctor.updated", doctorId: doctor._id });
  return ok(res, doctor, "Doctor updated");
});

exports.deactivateDoctor = ah(async (req, res) => {
  const doctor = await Doctor.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!doctor) return fail(res, "Doctor not found", 404);
  logger.info("ADMIN", `Doctor deactivated: ${doctor.name}`);
  eventHub.broadcast("board.updated", { reason: "doctor.deactivated", doctorId: doctor._id });
  return ok(res, doctor, "Doctor deactivated");
});
