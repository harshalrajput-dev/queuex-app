const mongoose = require("mongoose");

const WardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    wardType: {
      type: String,
      enum: ["ICU", "EMERGENCY_TRAUMA", "GENERAL"],
      required: true
    },
    description: { type: String, default: "" },
    totalBeds: { type: Number, required: true, min: 1 },
    availableBeds: { type: Number, required: true, min: 0 },
    occupiedBeds: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ward", WardSchema);
