const PDFDocument = require("pdfkit");

function generateWalkinPass(booking) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const formattedTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    doc.rect(0, 0, doc.page.width, 180).fill("#0a1533");

    doc.fontSize(28).font("Helvetica-Bold").fillColor("#ffffff")
      .text("QueueX Walk-in Token", 50, 40, { align: "center" });
    doc.fontSize(12).font("Helvetica").fillColor("#94a9cd")
      .text("New Civil Hospital, Surat", 50, 78, { align: "center" });

    doc.fontSize(36).font("Helvetica-Bold").fillColor("#fbbf24")
      .text(booking.tokenId || "N/A", 50, 110, { align: "center", continued: false });

    doc.fontSize(11).font("Helvetica").fillColor("#94a9cd")
      .text(`Generated: ${formattedDate} ${formattedTime}`, 50, 155, { align: "center" });

    let y = 210;

    doc.fontSize(14).font("Helvetica-Bold").fillColor("#0a1533")
      .text("PATIENT DETAILS", 50, y);
    y += 8;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#e2e8f0").lineWidth(1).stroke();
    y += 20;

    const leftCol = 60;
    const rightCol = 320;

    const drawField = (label, value, x, yPos) => {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#64748b")
        .text(label.toUpperCase(), x, yPos, { width: 220 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#0a1533")
        .text(value || "N/A", x, yPos + 14, { width: 220 });
      return yPos + 40;
    };

    y = drawField("Patient Name", booking.patientName, leftCol, y);
    y = drawField("Mobile Number", booking.patientMobile, leftCol, y);
    y = drawField("Department", booking.doctorDept, leftCol, y);
    y = drawField("Status", "CONFIRMED — Active Token", leftCol, y);

    let rightY = 220;
    rightY = drawField("Token Number", booking.tokenId, rightCol, rightY);
    rightY = drawField("Doctor", booking.doctorName, rightCol, rightY);
    rightY = drawField("Date", booking.bookingDate, rightCol, rightY);
    rightY = drawField("Time Slot", booking.slotTime, rightCol, rightY);

    y = Math.max(y, rightY) + 10;

    if (booking.symptoms) {
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#0a1533")
        .text("SYMPTOMS", 50, y);
      y += 8;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#e2e8f0").lineWidth(1).stroke();
      y += 16;
      doc.fontSize(11).font("Helvetica").fillColor("#334155")
        .text(booking.symptoms, 60, y, { width: doc.page.width - 120, lineGap: 3 });
      y += doc.heightOfString(booking.symptoms, { width: doc.page.width - 120 }) + 10;
    }

    y += 10;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#e2e8f0").lineWidth(1).stroke();
    y += 15;

    doc.rect(50, y, doc.page.width - 100, 60).fillAndStroke("#ecfdf5", "#a7f3d0");
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#047857")
      .text("Show this token at the OPD counter. The patient can use this token ID for future reference.", 60, y + 10, { width: doc.page.width - 120 });
    doc.fontSize(9).font("Helvetica").fillColor("#059669")
      .text("Arrive 15 minutes before your time slot. Carry a valid photo ID.", 60, y + 28, { width: doc.page.width - 120 });

    y += 75;

    doc.fontSize(9).font("Helvetica").fillColor("#94a3b8")
      .text("QueueX — New Civil Hospital, Surat", 50, y, { align: "center", width: doc.page.width - 100 });
    doc.text("This is an automated walk-in token pass. Not for official identification.", 50, y + 14, { align: "center", width: doc.page.width - 100 });

    doc.end();
  });
}

module.exports = { generateWalkinPass };
