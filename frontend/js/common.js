const API_BASE = "http://localhost:5000/api";
let currentUser = null;

function getToken() {
  return localStorage.getItem("qx_token") || "";
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("qx_user") || "null");
  } catch (e) {
    return null;
  }
}

function setSession(user, token) {
  if (!user || !token) return;
  currentUser = user;
  localStorage.setItem("qx_user", JSON.stringify(user));
  localStorage.setItem("qx_token", token);
}

function clearSession() {
  currentUser = null;
  localStorage.removeItem("qx_user");
  localStorage.removeItem("qx_token");
}

function roleHome(role) {
  return role === "PATIENT" ? "patient-dashboard.html" : "assistant-desk.html";
}

function roleLogin(role) {
  return role === "PATIENT" ? "login.html" : "assistant-login.html";
}

function requireAuth(roles) {
  const user = getUser();
  if (!user || !getToken()) {
    const staffOnly = Array.isArray(roles) && roles.some((r) => r !== "PATIENT");
    window.location.href = staffOnly ? "assistant-login.html" : "login.html";
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    window.location.href = roleHome(user.role);
    return null;
  }
  currentUser = user;
  return user;
}

async function api(path, options = {}) {
  const { method = "GET", body, auth = false } = options;
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status}). Please try again.`;
    throw new Error(message);
  }
  return data;
}

function logout() {
  const user = currentUser || getUser();
  clearSession();
  window.location.href = (user && user.role !== "PATIENT") ? "assistant-login.html" : "login.html";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function doctorAvatar(doc) {
  const name = escapeHtml((doc && doc.name) || "Doctor");
  const photo = doc && doc.photo && String(doc.photo).trim() ? String(doc.photo).trim() : "";
  if (!photo) {
    return `<img src="img/staff-default.svg" alt="${name}" loading="lazy">`;
  }
  return `<img src="${escapeHtml(photo)}" alt="${name}" loading="lazy" onerror="this.onerror=null;this.src='img/staff-default.svg';">`;
}

function statusBadge(status) {
  const s = (status || "").toUpperCase();
  const map = {
    PENDING_ASSISTANT: ["pending", "Waiting for confirmation"],
    CONFIRMED: ["confirmed", "Token confirmed"],
    PATIENT_ARRIVED: ["arrived", "Patient arrived"],
    IN_TREATMENT: ["in-treatment", "Treatment in progress"],
    COMPLETED: ["completed", "Treatment completed"],
    ADMITTED: ["admitted", "Patient admitted"],
    REJECTED: ["rejected", "Rejected"],
    CANCELLED: ["cancelled", "Cancelled"],
    NO_SHOW: ["no-show", "No show"]
  };
  const [cls, label] = map[s] || ["neutral", s.replace(/_/g, " ")];
  return `<span class="qx-badge ${cls}">${label}</span>`;
}

function toast(message) {
  let el = document.getElementById("qx-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "qx-toast";
    el.className = "qx-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("show"), 3500);
}

function ageFromDob(dobValue) {
  if (!dobValue) return "";
  const dob = new Date(dobValue);
  if (isNaN(dob.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age > 0 ? `${age} years` : "0 years";
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN");
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  try {
    const msg = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(msg);
  } catch (e) {
    /* ignore */
  }
}

function formatDistance(km) {
  return typeof km === "number" && isFinite(km) && km > 0 ? km.toFixed(1) + " km" : "—";
}

/* ---------- Token pass / QR helpers ---------- */

function qrDataURL(text, cellSize = 6, margin = 2) {
  if (typeof qrcode !== "function") return "";
  const qr = qrcode(0, "M");
  qr.addData(String(text), "Byte");
  qr.make();
  return qr.createDataURL(cellSize, margin);
}

function verifyTokenURL(booking) {
  const base = `${window.location.protocol}//${window.location.host}`;
  return `${base}/verify-token.html?token=${encodeURIComponent(booking.tokenId)}&sig=${encodeURIComponent(booking.qrSignature || "")}`;
}

function tokenPassHTML(booking) {
  const url = verifyTokenURL(booking);
  const qr = qrDataURL(url, 7, 3);
  const status = statusBadge(booking.status);
  const dist = booking.address
    ? `<span class="qx-badge confirmed">${formatDistance(booking.distanceKm)} from hospital</span>`
    : `<span class="qx-muted">-</span>`;
  return `
    <div class="qx-pass" id="tokenPass">
      <div class="qx-pass-head">
        <div class="qx-pass-brand">
          <span class="qx-brand-badge">🏥</span>
          <div>
            <strong>QueueX</strong>
            <small>New Civil Hospital, Surat</small>
          </div>
        </div>
        <div class="qx-pass-token">${escapeHtml(booking.tokenId)}</div>
      </div>
      <div class="qx-pass-body">
        <div class="qx-pass-patient">
          <strong>${escapeHtml(booking.patientName)}</strong>
          <div class="qx-muted">${escapeHtml(booking.patientMobile || "")}</div>
          <div class="qx-mt">${status}</div>
        </div>
        <div class="qx-pass-grid">
          <div><span>Doctor</span><b>${escapeHtml(booking.doctorName)}</b></div>
          <div><span>Department</span><b>${escapeHtml(booking.doctorDept || "")}</b></div>
          <div><span>Room</span><b>${escapeHtml(booking.roomNo || "-")}</b></div>
          <div><span>Date</span><b>${escapeHtml(booking.bookingDate)}</b></div>
          <div><span>Time slot</span><b>${escapeHtml(booking.slotTime)}</b></div>
          <div><span>Distance</span>${dist}</div>
        </div>
        ${booking.primarySymptom || (booking.symptoms && booking.symptoms.primary)
          ? `<div class="qx-pass-row"><span>Main symptom</span><b>${escapeHtml((booking.primarySymptom || booking.symptoms.primary))}</b></div>` : ""}
      </div>
      <div class="qx-pass-foot">
        <div class="qx-pass-qr">
          <a href="${url}" target="_blank" rel="noopener" title="Tap to verify this token">
            ${qr ? `<img src="${qr}" alt="QR code for ${escapeHtml(booking.tokenId)}" width="128" height="128">` : `<span class="qx-muted">QR unavailable</span>`}
          </a>
          <small>Scan or tap the QR to verify</small>
        </div>
        <div class="qx-pass-note">
          <b>Please carry this pass to the hospital.</b>
          <p class="qx-muted">Show the QR code at the OPD counter when you arrive. Arrive 15 minutes before your slot.</p>
        </div>
      </div>
    </div>`;
}

function openTokenPass(booking) {
  window.__qxPassBooking = booking;
  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>Appointment Pass</h3>
    <p class="qx-muted" style="margin:4px 0 14px;">Download or print your appointment pass with QR code.</p>
    ${tokenPassHTML(booking)}
    <div class="qx-modal-actions">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Close</button>
      <button class="qx-btn qx-btn-success qx-btn-sm" data-action="pass-print">🖨 Download / Print</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

function printTokenPass(booking) {
  const url = verifyTokenURL(booking);
  const qr = qrDataURL(url, 7, 3);
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) {
    toast("Please allow pop-ups to print your token.");
    return;
  }
  const body = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Token ${escapeHtml(booking.tokenId)} - QueueX Pass</title>
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
          <div class="token">${escapeHtml(booking.tokenId)}</div>
        </div>
        <div class="body">
          <div class="patient">
            <b>${escapeHtml(booking.patientName)}</b>
            <div class="muted">${escapeHtml(booking.patientMobile || "")}</div>
          </div>
          <table>
            <tr><td><span>Doctor</span><b>${escapeHtml(booking.doctorName)}</b></td>
                <td><span>Department</span><b>${escapeHtml(booking.doctorDept || "")}</b></td></tr>
            <tr><td><span>Room</span><b>${escapeHtml(booking.roomNo || "-")}</b></td>
                <td><span>Date</span><b>${escapeHtml(booking.bookingDate)}</b></td></tr>
            <tr><td><span>Time slot</span><b>${escapeHtml(booking.slotTime)}</b></td>
                <td><span>Status</span><b>${escapeHtml((booking.status || "").replace(/_/g, " "))}</b></td></tr>
            ${booking.primarySymptom || (booking.symptoms && booking.symptoms.primary)
              ? `<tr><td colspan="2"><span>Main symptom</span><b>${escapeHtml(booking.primarySymptom || booking.symptoms.primary)}</b></td></tr>` : ""}
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
  win.document.open();
  win.document.write(body);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 350);
}

function handleError(err, containerId) {
  const el = containerId ? document.getElementById(containerId) : null;
  if (el) {
    el.innerHTML = `<div class="qx-alert qx-alert-danger">${escapeHtml(err.message || "Something went wrong")}</div>`;
  } else {
    toast(err.message || "Something went wrong");
  }
}

function closeModal() {
  const backdrop = document.getElementById("modalBackdrop");
  if (backdrop) backdrop.classList.remove("show");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='pass-print']");
  if (btn && window.__qxPassBooking) printTokenPass(window.__qxPassBooking);
  const closeBtn = e.target.closest("[data-action='close']");
  if (closeBtn) closeModal();
});
