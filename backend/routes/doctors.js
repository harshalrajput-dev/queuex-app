const router = require("express").Router();
const ctrl = require("../controllers/doctorController");
const { protect, authorize } = require("../middleware/auth");
const { check, doctorRules, updateDoctorRules } = require("../middleware/validate");

router.get("/", ctrl.listDoctors);
router.get("/:id", ctrl.getDoctor);
router.post("/", protect, authorize("SUPER_ADMIN", "DOCTOR_ADMIN", "ASSISTANT"), doctorRules, check, ctrl.createDoctor);
router.put("/:id", protect, authorize("SUPER_ADMIN", "DOCTOR_ADMIN", "ASSISTANT"), updateDoctorRules, check, ctrl.updateDoctor);
router.delete("/:id", protect, authorize("SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.deactivateDoctor);

module.exports = router;
