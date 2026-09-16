const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const dns = require("dns");
require("dotenv").config();

const logger = require("./services/logger");
const { generalLimiter } = require("./middleware/rateLimiter");

const dnsConfig = process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1";
const servers = dnsConfig.split(",").map((s) => s.trim()).filter(Boolean);
if (servers.length) {
  try {
    dns.setServers(servers);
  } catch (err) {
    logger.error("DB", "Invalid DNS_SERVERS value");
  }
}

const { connectDB } = require("./config/db");
const { runSeed } = require("./seed/seed");
const { startApproachMonitor } = require("./services/approachAlertService");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { seedWards } = require("./controllers/wardController");

const authRoutes = require("./routes/auth");
const bookingRoutes = require("./routes/bookings");
const doctorRoutes = require("./routes/doctors");
const departmentRoutes = require("./routes/departments");
const notificationRoutes = require("./routes/notifications");
const queueRoutes = require("./routes/queue");
const healthRoutes = require("./routes/health");
const emergencyRoutes = require("./routes/emergency");
const assistantRoutes = require("./routes/assistant");
const wardRoutes = require("./routes/ward");

const app = express();

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use("/legacy", (req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https://cdn.jsdelivr.net; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://cdn.jsdelivr.net; " +
    "connect-src 'self'; " +
    "object-src 'none'; frame-ancestors 'none'"
  );
  next();
});

app.use(cors());

app.use("/api", generalLimiter);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/queue-display", queueRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/wards", wardRoutes);

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => runSeed())
  .then(() => seedWards())
  .then(() => {
    startApproachMonitor();
    app.listen(PORT, () => {
      logger.info("SERVER", `QueueX backend running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logger.error("SERVER", `Failed to start: ${err.message}`);
    process.exit(1);
  });
