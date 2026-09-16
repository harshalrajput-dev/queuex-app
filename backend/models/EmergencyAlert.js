const mongoose = require("mongoose");

const EmergencyAlertSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    patientName: { type: String, required: true },
    patientEmail: { type: String, required: true },
    patientMobile: { type: String, default: "" },
    alertFor: { type: String, default: "self" },
    familyMemberId: { type: String, default: "" },
    familyMemberName: { type: String, default: "" },
    tokenId: { type: String, default: "" },
    severity: {
      type: String,
      enum: ["MODERATE", "SERIOUS", "CRITICAL"],
      default: "MODERATE"
    },
    patientLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },
    customAddress: { type: String, default: "" },
    distanceKm: { type: Number, default: null },
    estimatedTravelMinutes: { type: Number, default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "CONFIRMED", "ADMITTED", "DISMISSED"],
      default: "ACTIVE"
    },
    roomNumber: { type: String, default: "" },
    ambulanceNumber: { type: String, default: "" },
    instructions: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: "" },
    admittedAt: { type: Date, default: null },
    admittedBy: { type: String, default: "" },
    dismissedBy: { type: String, default: "" },
    dismissedAt: { type: Date, default: null },
    dismissReason: { type: String, default: "" },
    triggeredAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmergencyAlert", EmergencyAlertSchema);
