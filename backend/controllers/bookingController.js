const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Notification = require("../models/Notification");
const { fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");
const logger = require("../services/logger");
const { estimateDistanceKm } = require("../utils/distance");
const { estimatePositions } = require("../utils/queueEstimate");
const { signPayload, verifyPayload } = require("../utils/qrSign");
const eventHub = require("../services/eventHub");

const ACTIVE_STATUSES = require("../utils/queueEstimate").ACTIVE_STATUSES;
const VALID_STATUSES = [
  "PENDING_ASSISTANT",
  "CONFIRMED",
  "PATIENT_ARRIVED",
  "IN_TREATMENT",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "NO_SHOW"
];

function generateTokenId() {
  return `QX-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function uniqueTokenId() {
  for (let i = 0; i < 10; i++) {
    const candidate = generateTokenId();
    const exists = await Booking.findOne({ tokenId: candidate });
    if (!exists) return candidate;
  }
  return `QX-${Date.now()}`;
}

async function notifyPatient(patientId, type, title, message, link = "") {
  if (!patientId) return;
  try {
    await Notification.create({ userId: patientId, type, title, message, link });
  } catch (err) {
    logger.error("TOKEN", `Notification create failed: ${err.message}`);
  }
}

exports.createBooking = ah(async (req, res) => {
  let {
    tokenId,
    patientName,
    patientEmail,
    patientMobile,
    doctorName,
    doctorDept,
    roomNo,
    slotTime,
    bookingDate,
    doctorId,
    symptoms,
    address,
    bookingFor,
    familyMemberId
  } = req.body;

  const patient = req.user.role === "PATIENT" ? req.user : null;

  let familyMemberName = "";
  if (patient) {
    patientName = patient.name;
    patientEmail = patient.email;
    patientMobile = patient.mobile;
    if (bookingFor && bookingFor !== "self" && familyMemberId) {
      const familyMember = (patient.familyMembers || []).find(
        (fm) => String(fm._id) === String(familyMemberId)
      );
      if (familyMember) {
        familyMemberName = familyMember.name;
        patientName = `${patient.name} → ${familyMember.name}`;
      }
    }
  }

  if (!patientName || !patientEmail || !doctorName || !slotTime || !bookingDate) {
    return fail(res, "Patient and doctor/slot/date are required", 422);
  }

  const sourceAddress = String(address || "").trim()
    || (patient && (patient.address || patient.city)) || "";
  const distanceKm = estimateDistanceKm(sourceAddress);

  const duplicate = await Booking.findOne({
    patientEmail: patientEmail.toLowerCase(),
    doctorName,
    bookingDate,
    slotTime,
    status: { $in: ACTIVE_STATUSES }
  });
  if (duplicate) {
    return fail(res, "You already have an active token for this doctor, date and slot", 409);
  }

  const existingActiveByPatient = await Booking.findOne({
    patientEmail: patientEmail.toLowerCase(),
    status: { $in: ACTIVE_STATUSES }
  });
  if (existingActiveByPatient) {
    return fail(res, `You already have an active token (${existingActiveByPatient.tokenId}). Please complete or cancel your current token before booking a new one.`, 409);
  }

  if (patientMobile) {
    const existingActiveByMobile = await Booking.findOne({
      patientMobile: String(patientMobile).trim(),
      patientEmail: { $ne: patientEmail.toLowerCase() },
      status: { $in: ACTIVE_STATUSES }
    });
    if (existingActiveByMobile) {
      return fail(res, `This mobile number already has an active token (${existingActiveByMobile.tokenId}). Only one active token per patient is allowed.`, 409);
    }
  }

  let doctor = null;
  if (doctorId && mongoose.isValidObjectId(doctorId)) {
    doctor = await Doctor.findById(doctorId);
  }
  if (!doctor) {
    doctor = await Doctor.findOne({ name: doctorName });
  }

  const capacity = doctor && doctor.capacity ? doctor.capacity : 20;
  if (doctor && doctor.status !== "AVAILABLE" && doctor.status !== "EMERGENCY_DUTY") {
    return fail(res, "This doctor is currently unavailable. Please select another doctor.", 409);
  }

  const filled = await Booking.countDocuments({
    doctorName,
    bookingDate,
    slotTime,
    status: { $in: ACTIVE_STATUSES }
  });
  if (filled >= capacity) {
    return fail(res, "All tokens for this time slot are full. Please select another slot.", 409);
  }

  if (doctor && doctor.room && !roomNo) roomNo = doctor.room;

  const finalTokenId = tokenId || (await uniqueTokenId());
  if (await Booking.findOne({ tokenId: finalTokenId })) {
    return fail(res, "Token number conflict. Please try again.", 409);
  }

  const booking = await Booking.create({
    tokenId: finalTokenId,
    patientName,
    patientEmail: String(patientEmail).trim().toLowerCase(),
    patientMobile,
    patientId: patient ? patient._id : null,
    bookingFor: bookingFor || "self",
    familyMemberId: familyMemberId || "",
    familyMemberName: familyMemberName,
    doctorName,
    doctorDept: doctorDept || (doctor ? doctor.department : ""),
    doctorId: doctor ? doctor._id : null,
    roomNo: roomNo || (doctor ? doctor.room : ""),
    slotTime,
    bookingDate,
    status: "PENDING_ASSISTANT",
    symptoms: symptoms || {},
    address: sourceAddress,
    distanceKm
  });

  logger.info("TOKEN", `Booking created ${finalTokenId} for ${patientEmail}`);
  await notifyPatient(
    patient ? patient._id : null,
    "TOKEN_BOOKED",
    "Token booked",
    `Your token ${finalTokenId} is waiting for hospital confirmation.`
  );

  eventHub.broadcast("board.updated", { reason: "booking.created", tokenId: finalTokenId });

  return res.status(201).json(booking);
});

exports.getBookings = ah(async (req, res) => {
  const { status, search, today, page, limit } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (today === "1" || today === "true") {
    filter.bookingDate = new Date().toISOString().split("T")[0];
  }

  const mine = req.query.mine === "1" || req.query.mine === "true";
  if (req.user.role === "PATIENT") {
    filter.patientEmail = req.user.email;
  } else if (mine && req.user) {
    filter.patientEmail = req.user.email;
  }

  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { patientName: rx },
      { patientMobile: rx },
      { tokenId: rx },
      { doctorName: rx }
    ];
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 100;

  let query = Booking.find(filter).sort({ createdAt: -1 });
  const total = await Booking.countDocuments(filter);
  if (limitNum > 0) query = query.skip((pageNum - 1) * limitNum).limit(limitNum);

  const bookings = await query;

  let positionMap = new Map();
  const active = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status));
  if (active.length) {
    const keys = new Set(active.map((b) => `${b.doctorName}||${b.bookingDate}||${b.slotTime}`));
    let cohortBookings = bookings;
    if (req.user.role === "PATIENT" || mine) {
      cohortBookings = await Booking.find({
        $or: [...keys].map((key) => {
          const [doctorName, bookingDate, slotTime] = key.split("||");
          return { doctorName, bookingDate, slotTime, status: { $in: ACTIVE_STATUSES } };
        })
      });
    }
    positionMap = estimatePositions(cohortBookings);
  }

  const enriched = await Promise.all(
    bookings.map(async (booking) => {
      const pos = positionMap.get(String(booking._id));
      const patientData = booking.patientId
        ? await User.findById(booking.patientId)
        : await User.findOne({ email: booking.patientEmail });
      const med = patientData && patientData.medicalHistory ? patientData.medicalHistory : null;
      return {
        ...booking.toObject(),
        qrSignature: signPayload({ tokenId: booking.tokenId }),
        tokensAhead: pos ? pos.tokensAhead : null,
        estimatedWaitMinutes: pos ? pos.estimatedWaitMinutes : 0,
        nowServingToken: pos ? pos.nowServingToken : null,
        profilePhoto: patientData ? patientData.profilePhoto || "" : "",
        medicalHistory: med
          ? {
              bloodPressure: med.bloodPressure || "Normal",
              preExistingConditions: med.preExistingConditions || [],
              allergies: med.allergies || "No",
              pastSurgeries: med.pastSurgeries || "No",
              pastTreated: med.pastTreated || "No",
              pastHospital: med.pastHospital || "",
              oldIssueCheck: med.oldIssueCheck || "No",
              currentProblem: med.currentProblem || "",
              problemDuration: med.problemDuration || "",
              severity: med.severity || "Mild",
              otherNotes: med.otherNotes || ""
            }
          : null
      };
    })
  );

  res.set("X-Total-Count", String(total));
  return res.json(enriched);
});

exports.verifyBooking = ah(async (req, res) => {
  const { tokenId } = req.params;
  const { sig } = req.query;

  if (!tokenId || !sig) {
    return fail(res, "A valid token QR code is required", 400);
  }

  const booking = await Booking.findOne({ tokenId: String(tokenId).trim() });
  if (!booking) {
    return fail(res, "This token could not be found. Please check the QR code.", 404);
  }

  if (!verifyPayload(sig, { tokenId: booking.tokenId })) {
    return fail(res, "Invalid or tampered QR code.", 401);
  }

  const validStatuses = ["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "COMPLETED"];
  return res.json({
    tokenId: booking.tokenId,
    patientName: booking.patientName,
    doctorName: booking.doctorName,
    doctorDept: booking.doctorDept,
    roomNo: booking.roomNo,
    slotTime: booking.slotTime,
    bookingDate: booking.bookingDate,
    status: booking.status,
    address: booking.address,
    distanceKm: booking.distanceKm,
    primarySymptom: booking.symptoms && booking.symptoms.primary,
    estimatedWaitMinutes: booking.estimatedWaitMinutes,
    valid: validStatuses.includes(booking.status),
    message: validStatuses.includes(booking.status)
      ? "Valid appointment pass"
      : "This token is not yet confirmed."
  });
});

exports.updateBooking = ah(async (req, res) => {
  const { id } = req.params;
  const { status, reason, note, reschedule, message } = req.body;

  let booking;
  if (mongoose.isValidObjectId(id)) {
    booking = await Booking.findById(id);
  }
  if (!booking) {
    booking = await Booking.findOne({ tokenId: id });
  }
  if (!booking) {
    return fail(res, "Booking not found!", 404);
  }

  if (req.user && req.user.role === "PATIENT") {
    if (String(booking.patientEmail).toLowerCase() !== req.user.email.toLowerCase()) {
      return fail(res, "Forbidden: you can only update your own tokens", 403);
    }
    if (status !== "CANCELLED") {
      return fail(res, "Patients can only cancel their own tokens", 403);
    }
  }

  const customMessage = String(message || reason || "").trim();

  if (reschedule && req.user && req.user.role !== "PATIENT") {
    const { bookingDate, slotTime } = reschedule;
    if (!bookingDate || !slotTime) {
      return fail(res, "Reschedule requires a new booking date and time slot", 422);
    }

    const doctor = await Doctor.findOne({ name: booking.doctorName });
    const capacity = doctor && doctor.capacity ? doctor.capacity : 20;
    const sameSlot = booking.bookingDate === bookingDate && booking.slotTime === slotTime;
    const filled = await Booking.countDocuments({
      _id: { $ne: booking._id },
      doctorName: booking.doctorName,
      bookingDate,
      slotTime,
      status: { $in: ACTIVE_STATUSES }
    });
    if (!sameSlot && filled >= capacity) {
      return fail(res, "The selected time slot is full. Please choose another slot.", 409);
    }

    booking.bookingDate = bookingDate;
    booking.slotTime = slotTime;
    booking.status = "PENDING_ASSISTANT";
    booking.rescheduledAt = new Date();
    booking.rescheduledTo = { bookingDate, slotTime };
    booking.rejectionReason = "";
    if (customMessage) booking.assistantNote = customMessage;
    await booking.save();

    logger.info("TOKEN", `${booking.tokenId} rescheduled to ${bookingDate} ${slotTime} by ${req.user.email}`);

    const rescheduleMsg = customMessage ||
      `Your token ${booking.tokenId} has been rescheduled to ${bookingDate} ${slotTime}. Please wait for confirmation or book another slot.`;
    await notifyPatient(booking.patientId, "TOKEN_RESCHEDULED", "Appointment rescheduled", rescheduleMsg);
    eventHub.broadcast("board.updated", { reason: "booking.rescheduled", tokenId: booking.tokenId });
    return res.json(booking);
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return fail(res, "Invalid booking status", 422);
  }

  const { onBookingStatusChange } = require("../controllers/wardController");

  const prevStatus = booking.status;
  booking.status = status;
  if (customMessage) booking.assistantNote = customMessage;
  if (status === "PATIENT_ARRIVED") booking.arrivalTime = new Date();
  if (status === "IN_TREATMENT") booking.inTreatmentTime = new Date();
  if (status === "COMPLETED") booking.completionTime = new Date();
  if (status === "REJECTED") booking.rejectionReason = customMessage || "";
  if (status === "CANCELLED") {
    booking.cancelledBy = req.user.email;
    booking.cancelledAt = new Date();
    booking.cancellationReason = customMessage || "";
  }
  await booking.save();

  await onBookingStatusChange(booking, prevStatus, status);

  logger.info("TOKEN", `${id} -> ${status} by ${req.user.email}`);

  const notifyMessage = status === "REJECTED" && customMessage
    ? customMessage
    : statusMessage(status, booking.tokenId);
  await notifyPatient(booking.patientId, "TOKEN_" + status, "Token update", notifyMessage);
  eventHub.broadcast("board.updated", { reason: `booking.${status.toLowerCase()}`, tokenId: booking.tokenId });
  return res.json(booking);
});

function statusMessage(status, tokenId) {
  switch (status) {
    case "CONFIRMED":
      return `Your token ${tokenId} has been confirmed. You can now download your token pass with QR code from the dashboard.`;
    case "REJECTED":
      return `Your token ${tokenId} was rejected. Please book another slot.`;
    case "PATIENT_ARRIVED":
      return `Your arrival for ${tokenId} has been recorded.`;
    case "IN_TREATMENT":
      return `Your treatment for ${tokenId} is in progress.`;
    case "COMPLETED":
      return `Your treatment for ${tokenId} is completed.`;
    case "NO_SHOW":
      return `Your appointment ${tokenId} was marked as no-show.`;
    case "CANCELLED":
      return `Your token ${tokenId} has been cancelled.`;
    default:
      return `Your token ${tokenId} status updated to ${status}.`;
  }
}
