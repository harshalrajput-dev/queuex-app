const Booking = require("../models/Booking");
const Doctor = require("../models/Doctor");
const Department = require("../models/Department");
const { ok } = require("../utils/response");
const ah = require("../utils/asyncHandler");

const QUEUED = ["CONFIRMED", "PATIENT_ARRIVED"];

exports.queueDisplay = ah(async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const departments = await Department.find({}).sort({ name: 1 });
  const doctors = await Doctor.find({ isActive: true }).sort({ department: 1, name: 1 });
  const todaysBookings = await Booking.find({ bookingDate: today });

  const result = await Promise.all(
    departments.map(async (dept) => {
      const deptDoctors = doctors.filter((d) => d.department === dept.name);
      const doctorRows = await Promise.all(
        deptDoctors.map(async (doc) => {
          const rows = todaysBookings
            .filter((b) => b.doctorName === doc.name)
            .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
          const nowServing = rows.find((b) => b.status === "IN_TREATMENT" || b.status === "PATIENT_ARRIVED");
          const waiting = rows.filter((b) => b.status === "CONFIRMED");
          const next = waiting[0] || null;
          const queuedBefore = rows.filter(
            (b) => QUEUED.includes(b.status) && (!nowServing || b.createdAt < nowServing.createdAt)
          ).length;
          const estimatedWait = (nowServing ? 1 : 0) + queuedBefore;
          return {
            doctorId: doc._id,
            doctor: doc.name,
            room: doc.room,
            status: doc.status,
            nowServing: nowServing ? nowServing.tokenId : null,
            next: next ? next.tokenId : null,
            waiting: waiting.length,
            estimatedWaitMinutes: (nowServing ? 0 : estimatedWait) * (doc.avgConsultMinutes || 8),
            totalSlots: rows.length
          };
        })
      );
      return {
        department: dept.name,
        departmentId: dept._id,
        doctors: doctorRows
      };
    })
  );

  return ok(res, result, "Queue display data");
});

exports.waitingEstimate = ah(async (req, res) => {
  const { tokenId } = req.params;
  const booking = await Booking.findOne({ tokenId });
  if (!booking) return ok(res, { tokenId, estimate: "Booking not found" }, "Estimate", 404);

  const today = booking.bookingDate;
  const doctor = await Doctor.findOne({ name: booking.doctorName });
  const rows = await Booking.find({
    bookingDate: today,
    doctorName: booking.doctorName,
    status: { $in: QUEUED }
  }).sort({ createdAt: 1 });

  const position = rows.findIndex((r) => r.tokenId === tokenId);
  const current = rows[0];
  const estimate = position >= 0 ? (position + 1) * (doctor ? doctor.avgConsultMinutes || 8 : 8) : 0;

  return ok(res, {
    tokenId,
    currentServing: current ? current.tokenId : null,
    position: position >= 0 ? position + 1 : null,
    estimatedWaitMinutes: estimate,
    note: "Estimate only"
  });
});
