const router = require("express").Router();
const mongoose = require("mongoose");
const { ok } = require("../utils/response");

router.get("/", (req, res) => {
  return ok(res, {
    server: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

module.exports = router;
