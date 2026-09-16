const router = require("express").Router();
const ctrl = require("../controllers/notificationController");
const { protect } = require("../middleware/auth");

router.get("/", protect, ctrl.listMyNotifications);
router.put("/read-all", protect, ctrl.markAllRead);
router.put("/:id/read", protect, ctrl.markRead);

module.exports = router;
