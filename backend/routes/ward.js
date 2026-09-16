const router = require("express").Router();
const ctrl = require("../controllers/wardController");
const { protect, authorize } = require("../middleware/auth");

router.get("/", ctrl.getWards);
router.get("/summary", ctrl.getWardSummary);
router.put("/:wardId", protect, authorize("ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.updateWardBeds);

module.exports = router;
