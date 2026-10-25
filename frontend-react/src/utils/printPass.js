import { qrDataURL, verifyTokenURL } from "./helpers.js";

export function bookingPrintHTML(booking) {
  const url = verifyTokenURL(booking.tokenId, booking.qrSignature);
  const qr = qrDataURL(url, 7, 3);
  const primitivePrimary = booking.primarySymptom || (booking.symptoms && booking.symptoms.primary) || "";
  const esc = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Token ${esc(booking.tokenId)} - QueueX Pass</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #0f1b38; background: #fff; padding: 24px; }
    .pass { max-width: 400px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 18px; color: #fff;
      background: linear-gradient(135deg, #0a1533, #12306e); }
    .head .brand { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .head .brand small { display: block; font-size: 11px; opacity: .8; }
    .head .token { font-size: 22px; font-weight: 800; letter-spacing: .5px; }
    .body { padding: 18px; }
    .patient { font-size: 16px; }
    .patient .muted { color: #64748b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    td { padding: 7px 6px; font-size: 13px; border-top: 1px dashed #e2e8f0; vertical-align: top; }
    td span { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; display: block; }
    td b { font-size: 13px; }
    .foot { display: flex; gap: 16px; align-items: center; padding: 14px 18px 18px; }
    .foot img { width: 110px; height: 110px; }
    .foot small { display: block; margin-top: 4px; color: #64748b; font-size: 11px; }
    .note { font-size: 12px; color: #334155; }
    .note b { display: block; margin-bottom: 4px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; padding: 10px 0 0; }
    @media print { body { padding: 0; } .pass { border: none; } }
  </style>
</head>
<body>
  <div class="pass">
    <div class="head">
      <div class="brand">🏥 QueueX<small>New Civil Hospital, Surat</small></div>
      <div class="token">${esc(booking.tokenId)}</div>
    </div>
    <div class="body">
      <div class="patient">
        <b>${esc(booking.patientName)}</b>
        <div class="muted">${esc(booking.patientMobile || "")}</div>
      </div>
      <table>
        <tr><td><span>Doctor</span><b>${esc(booking.doctorName)}</b></td>
            <td><span>Department</span><b>${esc(booking.doctorDept || "")}</b></td></tr>
        <tr><td><span>Room</span><b>${esc(booking.roomNo || "-")}</b></td>
            <td><span>Date</span><b>${esc(booking.bookingDate)}</b></td></tr>
        <tr><td><span>Time slot</span><b>${esc(booking.slotTime)}</b></td>
            <td><span>Status</span><b>${esc((booking.status || "").replace(/_/g, " "))}</b></td></tr>
        ${primitivePrimary ? `<tr><td colspan="2"><span>Main symptom</span><b>${esc(primitivePrimary)}</b></td></tr>` : ""}
      </table>
    </div>
    <div class="foot">
      ${qr ? `<div><img src="${qr}" alt="QR"><small>Scan to verify</small></div>` : ""}
      <div class="note"><b>Please carry this pass to the hospital.</b>Show the QR code at the OPD counter when you arrive. Arrive 15 minutes before your slot.</div>
    </div>
  </div>
  <div class="footer">QueueX · New Civil Hospital, Surat · Prototype for public hospital digital queue management</div>
</body>
</html>`;
}

export function walkinPrintHTML(data) {
  const esc = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const symptoms = data.symptoms || "Walk-in consultation";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Walk-in Token ${esc(data.tokenId)}</title>
  <style>*{box-sizing:border-box;margin:0;}body{font-family:"Segoe UI",Arial,sans-serif;color:#0f1b38;background:#fff;padding:24px;}
  .pass{max-width:360px;margin:0 auto;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden;}
  .head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:18px;color:#fff;background:linear-gradient(135deg,#0a1533,#12306e);}
  .head .brand{display:flex;align-items:center;gap:8px;font-size:14px;}
  .head .brand small{display:block;font-size:11px;opacity:.8;}
  .head .token{font-size:24px;font-weight:900;letter-spacing:.5px;color:#fbbf24;}
  .body{padding:18px;}
  .info{font-size:14px;margin-bottom:10px;}
  .info span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
  .info b{font-size:14px;}
  table{width:100%;border-collapse:collapse;margin-top:10px;}
  td{padding:8px 6px;font-size:13px;border-top:1px dashed #e2e8f0;}
  td span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;}
  td b{font-size:13px;}
  .symptoms{margin-top:12px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;}
  .symptoms span{display:block;color:#166534;font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:4px;}
  .symptoms b{font-size:13px;color:#0f172a;}
  .footer{text-align:center;font-size:11px;color:#94a3b8;padding:12px 0 0;}
  @media print{body{padding:0;}.pass{border:none;}}</style></head><body>
  <div class="pass">
    <div class="head"><div class="brand">🏥 QueueX<small>New Civil Hospital, Surat</small></div><div class="token">${esc(data.tokenId)}</div></div>
    <div class="body">
      <div class="info"><span>Patient Name</span><b>${esc(data.patientName)}</b></div>
      <div class="info"><span>Mobile</span><b>${esc(data.patientMobile)}</b></div>
      <table>
        <tr><td><span>Doctor</span><b>${esc(data.doctorName)}</b></td><td><span>Department</span><b>${esc(data.doctorDept)}</b></td></tr>
        <tr><td><span>Date</span><b>${esc(data.bookingDate)}</b></td><td><span>Time Slot</span><b>${esc(data.slotTime)}</b></td></tr>
        <tr><td colspan="2"><span>Status</span><b style="color:#059669;">ACTIVE</b></td></tr>
      </table>
      <div class="symptoms"><span>Symptoms / Chief Complaint</span><b>${esc(symptoms)}</b></div>
    </div>
  </div>
  <div class="footer">QueueX · New Civil Hospital, Surat</div></body></html>`;
}

export function printBooking(booking) {
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return false;
  win.document.open();
  win.document.write(bookingPrintHTML(booking));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
  return true;
}

export function printWalkin(data) {
  const win = window.open("", "_blank", "width=420,height=600");
  if (!win) return false;
  win.document.open();
  win.document.write(walkinPrintHTML(data));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
  return true;
}