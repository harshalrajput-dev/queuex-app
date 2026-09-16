const Booking = require("../models/Booking");
const User = require("../models/User");
const Notification = require("../models/Notification");
const SmsLog = require("../models/SmsLog");
const logger = require("./logger");
const { estimatePositions, ACTIVE_STATUSES } = require("../utils/queueEstimate");

const APPROACH_WINDOW = { min: 1, max: 2 };

let timer = null;
let running = false;

async function runApproachAlerts() {
  if (running) return;
  running = true;
  try {
    const active = await Booking.find({ status: { $in: ACTIVE_STATUSES } });
    if (!active.length) return;

    const positions = estimatePositions(active);

    for (const booking of active) {
      if (booking.approachAlertedAt) continue;
      if (booking.status !== "CONFIRMED") continue;

      const pos = positions.get(String(booking._id));
      if (!pos) continue;

      const ahead = pos.tokensAhead;
      if (ahead < APPROACH_WINDOW.min || ahead > APPROACH_WINDOW.max) continue;

      const tokenLabel = `${ahead} token${ahead === 1 ? "" : "s"} away`;

      const message =
        `Your token ${booking.tokenId} is now only ${tokenLabel} in the queue. ` +
        `Please leave for New Civil Hospital, Surat now to reach on time.`;
      const smsMessage =
        `QueueX Alert: Token ${booking.tokenId} is ${tokenLabel}. ` +
        `Please leave for New Civil Hospital, Surat now.`;

      let userId = booking.patientId;
      if (!userId && booking.patientEmail) {
        const user = await User.findOne({ email: String(booking.patientEmail).toLowerCase() });
        if (user) userId = user._id;
      }

      if (userId) {
        await Notification.create({
          userId,
          type: "TURN_APPROACHING",
          title: "Your turn is approaching",
          message,
          link: "patient-dashboard.html"
        });
      }

      await SmsLog.create({
        bookingId: booking._id,
        tokenId: booking.tokenId,
        patientName: booking.patientName,
        patientMobile: booking.patientMobile,
        patientEmail: booking.patientEmail,
        message: smsMessage
      });

      booking.approachAlertedAt = new Date();
      await booking.save();

      logger.warn(
        "SIM-SMS",
        `Approach alert sent to ${booking.patientMobile} (${booking.tokenId}, ${ahead} token(s) ahead)`
      );
    }
  } catch (err) {
    logger.error("ALERTS", `runApproachAlerts failed: ${err.message}`);
  } finally {
    running = false;
  }
}

function startApproachMonitor(intervalMs = 20000) {
  if (timer) return;
  runApproachAlerts();
  timer = setInterval(runApproachAlerts, intervalMs);
  logger.info("ALERTS", `Approach alert monitor started (every ${intervalMs}ms)`);
}

function stopApproachMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { runApproachAlerts, startApproachMonitor, stopApproachMonitor };
