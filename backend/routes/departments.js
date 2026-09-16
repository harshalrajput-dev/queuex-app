const router = require("express").Router();
const ctrl = require("../controllers/departmentController");
const { protect, authorize } = require("../middleware/auth");
const { check, departmentRules, updateDepartmentRules } = require("../middleware/validate");

router.get("/", ctrl.listDepartments);
router.get("/:id", ctrl.getDepartment);
router.post("/", protect, authorize("SUPER_ADMIN", "DOCTOR_ADMIN"), departmentRules, check, ctrl.createDepartment);
router.put("/:id", protect, authorize("SUPER_ADMIN", "DOCTOR_ADMIN"), updateDepartmentRules, check, ctrl.updateDepartment);

module.exports = router;
