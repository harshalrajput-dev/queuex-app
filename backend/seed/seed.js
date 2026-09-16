const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Department = require("../models/Department");
const Booking = require("../models/Booking");
const logger = require("../services/logger");

const DEPARTMENTS = [
  { name: "Cardiology", description: "Heart and blood vessel care", services: ["ECG", "Angiography", "OPD"], room: "OPD Block A" },
  { name: "Neurology", description: "Brain, spine and nervous system", services: ["EEG", "Neuro OPD"], room: "OPD Block A" },
  { name: "Orthopedic", description: "Bones, joints and trauma care", services: ["Fracture Care", "Joint Replacement"], room: "OPD Block B" },
  { name: "Eye Care", description: "Vision and eye disorders", services: ["Vision Test", "Cataract OPD"], room: "OPD Block B" },
  { name: "Dental", description: "Teeth, gums and oral health", services: ["Dental OPD", "Oral Surgery"], room: "OPD Block B" },
  { name: "General Medicine", description: "Common and chronic illnesses", services: ["Fever Clinic", "Diabetes OPD"], room: "OPD Block C" },
  { name: "Pediatrics", description: "Child health and care", services: ["Child OPD", "Vaccination"], room: "OPD Block C" },
  { name: "Dermatology", description: "Skin, hair and nail disorders", services: ["Skin OPD", "Allergy Clinic"], room: "OPD Block C" },
  { name: "ENT", description: "Ear, nose and throat", services: ["ENT OPD", "Audiometry"], room: "OPD Block D" },
  { name: "Gynecology", description: "Women's health", services: ["Gyne OPD", "Antenatal Care"], room: "OPD Block D" },
  { name: "Surgery", description: "General and minor surgery", services: ["Surgical OPD", "Minor OT"], room: "OT Complex" }
];

const DOCTORS = [
  { name: "Dr. Gajendra Reddy", photo: "img/Dr. Gajendra Reddy.webp", department: "Cardiology", qualification: "MD (Medicine), DM (Cardiology)", specialization: "High-risk heart attack management", room: "Room 101", experience: "18 Years", opdSlots: ["09:00 AM - 11:00 AM", "04:00 PM - 06:00 PM"], capacity: 20 },
  { name: "Dr. Kaushal Sharma", photo: "img/Dr. Kaushal Sharma.webp", department: "Cardiology", qualification: "DM (Cardiology)", specialization: "Angiography and pacemaker implants", room: "Room 102", experience: "14 Years", opdSlots: ["10:00 AM - 12:00 PM", "05:00 PM - 07:00 PM"], capacity: 15 },
  { name: "Dr. D. G. Desai", photo: "img/Dr. D. G. Desai.webp", department: "Dermatology", qualification: "MD (Dermatology)", specialization: "Chronic skin conditions and allergies", room: "Room 201", experience: "22 Years", opdSlots: ["09:00 AM - 11:00 AM", "03:00 PM - 05:00 PM"], capacity: 20 },
  { name: "Dr. Harimenon", photo: "img/Dr. Harimenon Orthopedic.webp", department: "Orthopedic", qualification: "MS (Orthopedics)", specialization: "Total knee and hip replacement", room: "Room 301", experience: "25 Years", opdSlots: ["09:00 AM - 11:00 AM", "04:00 PM - 06:00 PM"], capacity: 18 },
  { name: "Dr. Priti Kapadia", photo: "img/Dr. Priti Kapadia.webp", department: "General Medicine", qualification: "MD (Internal Medicine)", specialization: "Complex metabolic disorders and diabetes", room: "Room 401", experience: "20 Years", opdSlots: ["09:00 AM - 11:00 AM", "04:00 PM - 06:00 PM"], capacity: 25 },
  { name: "Dr. Neha Bhatt", photo: "img/Dr. Neha Bhatt.webp", department: "Pediatrics", qualification: "MD (Pediatrics)", specialization: "Child health and vaccination", room: "Room 501", experience: "12 Years", opdSlots: ["10:00 AM - 01:00 PM"], capacity: 20 },
  { name: "Dr. Rakesh Trivedi", photo: "img/Dr. Rakesh Trivedi.webp", department: "ENT", qualification: "MS (ENT)", specialization: "Ear, nose and throat surgery", room: "Room 601", experience: "15 Years", opdSlots: ["11:00 AM - 02:00 PM"], capacity: 15 }
];

async function runSeed() {
  if (process.env.SEED_DEV_DATA === "false") {
    logger.warn("SEED", "SEED_DEV_DATA=false, skipping development seed");
    return;
  }

  const depCount = await Department.countDocuments();
  if (depCount === 0) {
    await Department.insertMany(
      DEPARTMENTS.map((d) => ({ ...d, dataSource: "development-seed" }))
    );
    logger.warn("SEED", "Inserted 11 development/test departments (not actual government data)");
  }

  const docCount = await Doctor.countDocuments();
  if (docCount === 0) {
    await Doctor.insertMany(
      DOCTORS.map((d) => ({ ...d, dataSource: "development-seed", status: "AVAILABLE", isActive: true }))
    );
    logger.warn("SEED", "Inserted development/test doctors (not actual government data)");
  } else {
    for (const d of DOCTORS) {
      await Doctor.updateOne({ name: d.name }, { $set: { photo: d.photo } });
    }
    logger.warn("SEED", `Updated photo paths for ${DOCTORS.length} development/test doctors`);
  }

  const legacyAssistant = await User.findOne({ email: "assistant@queuex.test" });
  let assistant = await User.findOne({ email: "assistant@queueex.test" });
  if (legacyAssistant && !assistant) {
    legacyAssistant.email = "assistant@queueex.test";
    await legacyAssistant.save();
    assistant = legacyAssistant;
    logger.warn("SEED", "Migrated dev assistant email to assistant@queueex.test");
  }
  if (!assistant) {
    await User.create({
      name: "Hospital Assistant (DEV TEST)",
      email: "assistant@queueex.test",
      mobile: "9999999901",
      bloodGroup: "Unknown",
      password: await bcrypt.hash("Assistant@123", 10),
      role: "ASSISTANT",
      employeeId: "DEV-ASST-001",
      mobileVerified: true
    });
    logger.warn("SEED", "Created development/test assistant: assistant@queueex.test / Assistant@123");
  } else {
    const ok = await bcrypt.compare("Assistant@123", assistant.password);
    if (!ok) {
      assistant.password = await bcrypt.hash("Assistant@123", 10);
      await assistant.save();
      logger.warn("SEED", "Dev assistant password restored to documented value: Assistant@123");
    }
  }

  const admin = await User.findOne({ email: "admin@queuex.test" });
  if (!admin) {
    await User.create({
      name: "QueueX Super Admin (DEV TEST)",
      email: "admin@queuex.test",
      mobile: "9999999902",
      bloodGroup: "Unknown",
      password: await bcrypt.hash("Admin@123", 10),
      role: "SUPER_ADMIN",
      employeeId: "DEV-ADMIN-001",
      mobileVerified: true
    });
    logger.warn("SEED", "Created development/test super admin: admin@queuex.test / Admin@123");
  } else {
    const ok = await bcrypt.compare("Admin@123", admin.password);
    if (!ok) {
      admin.password = await bcrypt.hash("Admin@123", 10);
      await admin.save();
      logger.warn("SEED", "Dev admin password restored to documented value: Admin@123");
    }
  }

  const bookingCount = await Booking.countDocuments();
  if (bookingCount === 0) {
    const today = new Date().toISOString().split("T")[0];
    let patient = await User.findOne({ email: "patient@queuex.test" });
    if (!patient) {
      patient = await User.create({
        name: "Rahul Sharma (DEV TEST)",
        email: "patient@queuex.test",
        mobile: "9999999910",
        bloodGroup: "O+",
        password: await bcrypt.hash("Patient@123", 10),
        role: "PATIENT",
        address: "Ring Road, Majura Gate",
        city: "Surat",
        mobileVerified: true,
        medicalHistory: {
          bloodPressure: "120/80",
          preExistingConditions: ["Diabetes"],
          allergies: "Penicillin",
          pastSurgeries: "No",
          pastTreated: "No",
          pastHospital: "",
          oldIssueCheck: "No",
          currentProblem: "Fever and cough for the last 3 days",
          problemDuration: "3 Days",
          severity: "Moderate",
          otherNotes: ""
        }
      });
      logger.warn("SEED", "Created development/test patient: patient@queuex.test / Patient@123");
    }

    const doctors = await Doctor.find({});
    const byName = (name) => doctors.find((d) => d.name === name);

    const bookings = [
      { tokenId: "QX-1001", doctorName: "Dr. Gajendra Reddy", slotTime: "09:00 AM - 11:00 AM", status: "PENDING_ASSISTANT", symptoms: "Fever with mild headache" },
      { tokenId: "QX-1002", doctorName: "Dr. Gajendra Reddy", slotTime: "09:00 AM - 11:00 AM", status: "CONFIRMED", symptoms: "Chest pain on exertion", distanceKm: 4.2 },
      { tokenId: "QX-1003", doctorName: "Dr. Gajendra Reddy", slotTime: "09:00 AM - 11:00 AM", status: "PATIENT_ARRIVED", symptoms: "Palpitations", distanceKm: 1.8 },
      { tokenId: "QX-1004", doctorName: "Dr. Priti Kapadia", slotTime: "09:00 AM - 11:00 AM", status: "PENDING_ASSISTANT", symptoms: "Uncontrolled blood sugar", distanceKm: 6.5 },
      { tokenId: "QX-1005", doctorName: "Dr. Priti Kapadia", slotTime: "09:00 AM - 11:00 AM", status: "CONFIRMED", symptoms: "Recurrent acidity and nausea" },
      { tokenId: "QX-1006", doctorName: "Dr. Priti Kapadia", slotTime: "09:00 AM - 11:00 AM", status: "IN_TREATMENT", symptoms: "Blood pressure checkup", distanceKm: 2.1 },
      { tokenId: "QX-1007", doctorName: "Dr. Neha Bhatt", slotTime: "10:00 AM - 01:00 PM", status: "CONFIRMED", symptoms: "Child vaccination due" },
      { tokenId: "QX-1008", doctorName: "Dr. Harimenon", slotTime: "09:00 AM - 11:00 AM", status: "COMPLETED", symptoms: "Knee pain follow-up", distanceKm: 9.0 },
      { tokenId: "QX-1009", doctorName: "Dr. D. G. Desai", slotTime: "09:00 AM - 11:00 AM", status: "REJECTED", symptoms: "Skin rash", rejectionReason: "Doctor not available, please book another slot." },
      { tokenId: "QX-1010", doctorName: "Dr. Kaushal Sharma", slotTime: "10:00 AM - 12:00 PM", status: "NO_SHOW", symptoms: "ECG review" }
    ];

    const docs = bookings.map((b, i) => {
      const doctor = byName(b.doctorName);
      return {
        tokenId: b.tokenId,
        patientName: patient.name,
        patientEmail: patient.email,
        patientMobile: patient.mobile,
        patientId: patient._id,
        doctorName: b.doctorName,
        doctorDept: doctor ? doctor.department : "General Medicine",
        doctorId: doctor ? doctor._id : null,
        roomNo: doctor ? doctor.room : "",
        slotTime: b.slotTime,
        bookingDate: today,
        status: b.status,
        symptoms: { primary: b.symptoms, severity: "Mild", duration: "3 Days" },
        address: patient.address,
        distanceKm: b.distanceKm || 0,
        rejectionReason: b.rejectionReason || "",
        createdAt: new Date(Date.now() - (bookings.length - i) * 60000),
        updatedAt: new Date()
      };
    });

    await Booking.insertMany(docs);
    logger.warn("SEED", `Inserted ${docs.length} development/test bookings for today (${today})`);
  }
}

module.exports = { runSeed };
