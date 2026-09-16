const router = require("express").Router();
const ctrl = require("../controllers/emergencyController");
const { protect } = require("../middleware/auth");

router.get("/", protect, ctrl.getActiveAlerts);
router.get("/history", protect, ctrl.getConfirmedHistory);
router.get("/check", protect, ctrl.checkActive);
router.get("/cooldown", protect, ctrl.checkCooldown);
router.get("/:id/pass", protect, ctrl.getPass);
router.post("/trigger", protect, ctrl.triggerSOS);
router.post("/confirm", protect, ctrl.confirmEmergency);
router.post("/admit", protect, ctrl.admitEmergency);
router.put("/:id/dismiss", protect, ctrl.dismissAlert);

module.exports = router;
