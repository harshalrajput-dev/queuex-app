const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true, unique: true },
    patientName: { type: String, required: true },
    patientEmail: { type: String, required: true },
    patientMobile: { type: String, required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bookingFor: { type: String, default: "self" },
    familyMemberId: { type: String, default: "" },
    familyMemberName: { type: String, default: "" },
    doctorName: { type: String, required: true },
    doctorDept: { type: String, required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null },
    roomNo: { type: String, default: "" },
    slotTime: { type: String, required: true },
    bookingDate: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "PENDING_ASSISTANT",
        "CONFIRMED",
        "PATIENT_ARRIVED",
        "IN_TREATMENT",
        "COMPLETED",
        "REJECTED",
        "CANCELLED",
        "NO_SHOW"
      ],
      default: "PENDING_ASSISTANT"
    },
    symptoms: {
      primary: { type: String, default: "" },
      severity: { type: String, default: "Mild" },
      duration: { type: String, default: "" },
      previousProblem: { type: String, default: "No" }
    },
    address: { type: String, default: "" },
    distanceKm: { type: Number, default: 0, min: 0, max: 200 },
    tokensAhead: { type: Number, default: null },
    estimatedWaitMinutes: { type: Number, default: 0 },
    approachAlertedAt: { type: Date, default: null },
    assistantNote: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    arrivalTime: { type: Date, default: null },
    inTreatmentTime: { type: Date, default: null },
    completionTime: { type: Date, default: null },
    cancelledBy: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
    rescheduledAt: { type: Date, default: null },
    rescheduledTo: {
      bookingDate: { type: String, default: "" },
      slotTime: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", BookingSchema);
