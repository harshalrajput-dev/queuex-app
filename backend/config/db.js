const mongoose = require("mongoose");
const logger = require("../services/logger");

function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error("DB", "MONGODB_URI is not set. Check backend/.env");
    process.exit(1);
  }
  return mongoose
    .connect(uri)
    .then(() => logger.info("DB", "MongoDB connected successfully"))
    .catch((err) => {
      logger.error("DB", `MongoDB Connection Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { connectDB };
