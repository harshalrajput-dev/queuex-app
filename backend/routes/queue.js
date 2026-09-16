const router = require("express").Router();
const ctrl = require("../controllers/queueController");
const eventHub = require("../services/eventHub");

router.get("/", ctrl.queueDisplay);

router.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(": connected\n\n");
  eventHub.subscribe(res);
});

router.get("/waiting/:tokenId", ctrl.waitingEstimate);

module.exports = router;
