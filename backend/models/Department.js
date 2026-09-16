const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    services: { type: [String], default: [] },
    opdTiming: { type: String, default: "09:00 AM - 05:00 PM" },
    availableDays: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
    room: { type: String, default: "" },
    status: { type: String, default: "active" },
    dataSource: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", DepartmentSchema);
