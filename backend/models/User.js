const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    bloodGroup: { type: String, required: true, default: "Unknown" },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["PATIENT", "ASSISTANT", "DOCTOR_ADMIN", "SUPER_ADMIN"],
      default: "PATIENT"
    },
    profilePhoto: { type: String, default: "" },
    dob: { type: Date, default: null },
    gender: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    emergencyContact: { type: String, default: "" },
    mobileVerified: { type: Boolean, default: false },
    otpCode: { type: String, default: "" },
    otpExpires: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    employeeId: { type: String, default: "" },
    active: { type: Boolean, default: true },
    emergencyCoolDownUntil: { type: Date, default: null },
    familyMembers: [
      {
        name: { type: String, required: true, trim: true },
        age: { type: Number, required: true, min: 0, max: 120 },
        relation: { type: String, required: true, enum: ["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Grandfather", "Grandmother", "Other"] },
        gender: { type: String, required: true, enum: ["Male", "Female", "Other"] },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    medicalHistory: {
      bloodPressure: { type: String, default: "Normal" },
      preExistingConditions: { type: [String], default: [] },
      allergies: { type: String, default: "No" },
      pastSurgeries: { type: String, default: "No" },
      pastTreated: { type: String, default: "No" },
      pastHospital: { type: String, default: "" },
      oldIssueCheck: { type: String, default: "No" },
      currentProblem: { type: String, default: "" },
      problemDuration: { type: String, default: "" },
      severity: { type: String, default: "Mild" },
      otherNotes: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

UserSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otpCode;
  delete obj.otpExpires;
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
