const mongoose = require("mongoose");

const SmsLogSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    tokenId: { type: String, default: "" },
    patientName: { type: String, default: "" },
    patientMobile: { type: String, default: "" },
    patientEmail: { type: String, default: "" },
    channel: { type: String, default: "SMS/WhatsApp (simulated)" },
    message: { type: String, default: "" },
    delivered: { type: Boolean, default: true },
    simulated: { type: Boolean, default: true },
    sentAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SmsLog", SmsLogSchema);
