const router = require("express").Router();
const ctrl = require("../controllers/bookingController");
const { protect } = require("../middleware/auth");
const { bookingLimiter } = require("../middleware/rateLimiter");
const { check, createBookingRules, updateBookingRules } = require("../middleware/validate");

router.get("/", protect, ctrl.getBookings);
router.get("/verify/:tokenId", ctrl.verifyBooking);
router.post("/", protect, bookingLimiter, createBookingRules, check, ctrl.createBooking);
router.put("/:id", protect, updateBookingRules, check, ctrl.updateBooking);

module.exports = router;
