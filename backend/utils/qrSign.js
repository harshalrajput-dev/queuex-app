const crypto = require("crypto");

function qrSecret() {
  return process.env.JWT_SECRET || "queuex-dev-secret";
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", qrSecret())
    .update(JSON.stringify(payload))
    .digest("hex");
}

function verifyPayload(sig, payload) {
  if (!sig || typeof sig !== "string") return false;
  const expected = signPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { signPayload, verifyPayload };
