const mongoose = require("mongoose");

const DoctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    photo: { type: String, default: "" },
    qualification: { type: String, default: "" },
    registrationNo: { type: String, default: "" },
    specialization: { type: String, default: "" },
    department: { type: String, required: true, trim: true },
    experience: { type: String, default: "" },
    room: { type: String, default: "" },
    opdDays: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
    opdSlots: { type: [String], default: [] },
    opdTime: { type: String, default: "" },
    capacity: { type: Number, default: 20 },
    avgConsultMinutes: { type: Number, default: 8 },
    status: {
      type: String,
      enum: ["AVAILABLE", "ON_LEAVE", "NOT_AVAILABLE", "EMERGENCY_DUTY", "OUT_OF_HOSPITAL"],
      default: "AVAILABLE"
    },
    isActive: { type: Boolean, default: true },
    leave: {
      from: { type: Date, default: null },
      to: { type: Date, default: null },
      reason: { type: String, default: "" },
      message: { type: String, default: "" },
      expectedReturn: { type: String, default: "" }
    },
    dataSource: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Doctor", DoctorSchema);
