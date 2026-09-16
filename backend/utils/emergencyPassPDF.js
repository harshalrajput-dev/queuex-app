const PDFDocument = require("pdfkit");

const SEVERITY_COLORS = {
  MODERATE: "#f59e0b",
  SERIOUS: "#f97316",
  CRITICAL: "#ef4444"
};

const SEVERITY_LABELS = {
  MODERATE: "MODERATE / STABLE",
  SERIOUS: "SERIOUS / URGENT",
  CRITICAL: "CRITICAL / SEVERE"
};

function generateEmergencyPass(alert) {
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
      .text("QueueX Emergency Pass", 50, 40, { align: "center" });
    doc.fontSize(12).font("Helvetica").fillColor("#94a9cd")
      .text("New Civil Hospital, Surat — Emergency Department", 50, 78, { align: "center" });

    doc.fontSize(36).font("Helvetica-Bold").fillColor("#fbbf24")
      .text(alert.tokenId || "N/A", 50, 110, { align: "center", continued: false });

    doc.fontSize(11).font("Helvetica").fillColor("#94a9cd")
      .text(`Generated: ${formattedDate} ${formattedTime}`, 50, 155, { align: "center" });

    let y = 210;

    doc.fontSize(14).font("Helvetica-Bold").fillColor("#0a1533")
      .text("EMERGENCY CONFIRMATION", 50, y);
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

    const drawSeverityBadge = (severity, x, yPos) => {
      const label = SEVERITY_LABELS[severity] || "MODERATE / STABLE";
      const color = SEVERITY_COLORS[severity] || "#f59e0b";
      const bgColor = severity === "CRITICAL" ? "#fef2f2" : severity === "SERIOUS" ? "#fff7ed" : "#fffbeb";
      const borderColor = severity === "CRITICAL" ? "#fca5a5" : severity === "SERIOUS" ? "#fed7aa" : "#fde68a";

      doc.roundedRect(x, yPos, 200, 36, 4).fillAndStroke(bgColor, borderColor);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748b")
        .text("SEVERITY LEVEL", x + 8, yPos + 5, { width: 184 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor(color)
        .text(label, x + 8, yPos + 18, { width: 184 });
      return yPos + 46;
    };

    const drawLocationField = (label, value, x, yPos) => {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#64748b")
        .text(label.toUpperCase(), x, yPos, { width: 500 });
      doc.fontSize(11).font("Helvetica").fillColor("#0a1533")
        .text(value || "N/A", x, yPos + 14, { width: 500 });
      return yPos + 34;
    };

    y = drawField("Patient Name", alert.patientName, leftCol, y);
    y = drawField("Token Number", alert.tokenId || "N/A", leftCol, y);
    y = drawField("Assigned Room", alert.roomNumber ? `Room ${alert.roomNumber}` : "Not assigned", leftCol, y);
    y = drawField("Ambulance Number", alert.ambulanceNumber || "Not assigned", leftCol, y);
    y = drawField("Status", alert.status === "ADMITTED" ? "ADMITTED — Patient In Hospital" : "CONFIRMED — Emergency Accepted", leftCol, y);

    let rightY = 220;
    rightY = drawSeverityBadge(alert.severity || "MODERATE", rightCol, rightY);
    rightY = drawField("Patient Mobile", alert.patientMobile || "N/A", rightCol, rightY);
    rightY = drawField("Patient Email", alert.patientEmail || "N/A", rightCol, rightY);
    rightY = drawField("Confirmed By", alert.confirmedBy || "Staff", rightCol, rightY);

    y = Math.max(y, rightY) + 6;

    if (alert.customAddress) {
      y = drawLocationField("Patient Current Address", alert.customAddress, leftCol, y);
    }

    const distEtaY = y;
    if (alert.distanceKm != null) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#64748b")
        .text("DISTANCE FROM HOSPITAL", leftCol, distEtaY, { width: 220 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1e40af")
        .text(`${alert.distanceKm} km`, leftCol, distEtaY + 14, { width: 220 });
    }
    if (alert.estimatedTravelMinutes != null) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#64748b")
        .text("EST. TRAVEL TIME", rightCol, distEtaY, { width: 220 });
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1e40af")
        .text(`~${alert.estimatedTravelMinutes} min`, rightCol, distEtaY + 14, { width: 220 });
    }
    y = distEtaY + 44;

    if (alert.patientLocation && alert.patientLocation.lat != null) {
      doc.fontSize(8).font("Helvetica").fillColor("#94a3b8")
        .text(`GPS: ${alert.patientLocation.lat.toFixed(5)}, ${alert.patientLocation.lng.toFixed(5)}`, leftCol, y, { width: 500 });
      y += 16;
    }

    if (alert.instructions) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e3a8a")
        .text("Emergency Instructions:", 50, y, { width: doc.page.width - 100 });
      y += 18;
      doc.fontSize(10).font("Helvetica").fillColor("#334155")
        .text(alert.instructions, 50, y, { width: doc.page.width - 100, lineGap: 3 });
      y += doc.heightOfString(alert.instructions, { width: doc.page.width - 100 }) + 10;
    }

    y += 10;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor("#e2e8f0").lineWidth(1).stroke();
    y += 15;

    doc.rect(50, y, doc.page.width - 100, 60).fillAndStroke("#eff6ff", "#bfdbfe");
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e40af")
      .text("IMPORTANT: Present this pass at Room " + (alert.roomNumber || "____") + " to initiate treatment immediately.", 60, y + 10, { width: doc.page.width - 120 });
    doc.fontSize(9).font("Helvetica").fillColor("#3b82f6")
      .text("This is an officially confirmed emergency pass from QueueX. Hospital staff will verify and proceed.", 60, y + 28, { width: doc.page.width - 120 });

    y += 75;

    doc.fontSize(9).font("Helvetica").fillColor("#94a3b8")
      .text("QueueX — New Civil Hospital, Surat", 50, y, { align: "center", width: doc.page.width - 100 });
    doc.text("This is an automated emergency confirmation pass. Not for official identification.", 50, y + 14, { align: "center", width: doc.page.width - 100 });

    doc.end();
  });
}

module.exports = { generateEmergencyPass };
