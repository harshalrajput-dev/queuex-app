const router = require("express").Router();
const ctrl = require("../controllers/assistantController");
const { protect, authorize } = require("../middleware/auth");

router.get("/live-stats", protect, authorize("ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.getLiveStats);
router.get("/analytics", protect, authorize("ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.getAnalytics);
router.get("/active-token-check", protect, ctrl.checkActiveToken);
router.get("/walkin-history", protect, authorize("ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.getWalkinHistory);
router.get("/walkin-pass/:tokenId/pdf", protect, authorize("ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.getWalkinPassPdf);
router.post("/walkin-token", protect, authorize("ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"), ctrl.createWalkinToken);

module.exports = router;
