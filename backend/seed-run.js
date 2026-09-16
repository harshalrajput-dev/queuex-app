require("dotenv").config();
const dns = require("dns");
const { connectDB } = require("./config/db");
const { runSeed } = require("./seed/seed");
const logger = require("./services/logger");

const dnsConfig = process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1";
const servers = dnsConfig.split(",").map((s) => s.trim()).filter(Boolean);
if (servers.length) {
  try {
    dns.setServers(servers);
  } catch (err) {
    logger.error("DB", "Invalid DNS_SERVERS value");
  }
}

connectDB()
  .then(runSeed)
  .then(() => {
    logger.info("SEED", "Seed completed");
    process.exit(0);
  })
  .catch((err) => {
    logger.error("SEED", err.message);
    process.exit(1);
  });
