const Department = require("../models/Department");
const { ok, fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");
const logger = require("../services/logger");

exports.listDepartments = ah(async (req, res) => {
  const departments = await Department.find({}).sort({ name: 1 });
  return ok(res, departments, "Departments list");
});

exports.getDepartment = ah(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) return fail(res, "Department not found", 404);
  return ok(res, department);
});

exports.createDepartment = ah(async (req, res) => {
  const { name } = req.body;
  if (!name) return fail(res, "Department name is required", 422);
  const exists = await Department.findOne({ name: String(name).trim() });
  if (exists) return fail(res, "Department already exists", 409);
  const department = await Department.create({ ...req.body, name: String(name).trim() });
  logger.info("ADMIN", `Department created: ${department.name}`);
  return ok(res, department, "Department created", 201);
});

exports.updateDepartment = ah(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!department) return fail(res, "Department not found", 404);
  logger.info("ADMIN", `Department updated: ${department.name}`);
  return ok(res, department, "Department updated");
});
