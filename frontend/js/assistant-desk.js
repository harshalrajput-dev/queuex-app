let queue = [];
let doctors = [];
let confirmedEmergencies = [];
let walkinHistory = [];
let refreshing = false;
let refreshTimer = null;
let activeEmergencyAlert = null;
let activeTab = "all";
let liveStatsInterval = null;
let analyticsData = null;
let analyticsPeriod = "monthly";

async function init() {
  const user = requireAuth(["ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"]);
  if (!user) return;
  document.getElementById("navName").textContent = user.name;
  const navAvatar = document.getElementById("navAvatar");
  if (user.profilePhoto) navAvatar.src = user.profilePhoto;
  else navAvatar.src = "img/staff-default.svg";

  await refresh();
  startRealtime();
  loadLiveStats();
  loadWardOccupancy();
  liveStatsInterval = setInterval(loadLiveStats, 10000);
  setInterval(refresh, 30000);
  setInterval(loadWardOccupancy, 15000);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    await Promise.all([loadQueue(), loadDoctors(), loadConfirmedEmergencies()]);
    document.getElementById("lastUpdated").textContent = new Date().toLocaleTimeString("en-IN");
  } finally {
    refreshing = false;
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 150);
}

function startRealtime() {
  if (!window.EventSource) return;
  const es = new EventSource(`${API_BASE}/queue-display/events`);
  es.addEventListener("board.updated", () => scheduleRefresh());
  es.addEventListener("emergency.triggered", (e) => {
    try {
      const data = JSON.parse(e.data);
      showEmergencyBanner(data);
    } catch (err) { /* silent */ }
  });
  es.addEventListener("emergency.dismissed", () => {
    hideEmergencyBanner();
  });
  es.addEventListener("emergency.confirmed", (e) => {
    try {
      const data = JSON.parse(e.data);
      hideEmergencyBanner();
      loadConfirmedEmergencies();
      toast(`✅ Emergency confirmed for ${data.patientName || "patient"} → Room ${data.roomNumber || "?"}`);
    } catch (err) { /* silent */ }
  });
  es.addEventListener("emergency.admitted", (e) => {
    try {
      loadConfirmedEmergencies();
      loadWardOccupancy();
      toast(`🏥 Patient admitted. Emergency SOS locked for 3 days.`);
    } catch (err) { /* silent */ }
  });
  es.addEventListener("ward.updated", () => loadWardOccupancy());
  es.onerror = () => { /* EventSource reconnects automatically */ };
}

/* ---------- Live Stats ---------- */

async function loadLiveStats() {
  try {
    const res = await api("/assistant/live-stats", { auth: true });
    const s = res.data || res;
    document.getElementById("liveActiveLogins").textContent = s.activeLogins || 0;
    document.getElementById("liveTodayBookings").textContent = s.todayBookings || 0;
    document.getElementById("liveCompletedToday").textContent = s.completedToday || 0;
    document.getElementById("livePendingToday").textContent = s.pendingToday || 0;
    document.getElementById("liveTotalBookings").textContent = s.totalBookings || 0;
  } catch (err) {
    /* silent - live stats are non-critical */
  }
}

/* ---------- Ward Occupancy ---------- */

async function loadWardOccupancy() {
  try {
    const res = await api("/wards/summary");
    const d = res.data || res;
    const availEl = document.getElementById("asAvailBeds");
    const occEl = document.getElementById("asOccupiedBeds");
    const rateEl = document.getElementById("asOccupancyRate");
    if (availEl) availEl.textContent = `Available: ${d.availableBeds ?? "--"}`;
    if (occEl) occEl.textContent = `Occupied: ${d.occupiedBeds ?? "--"}`;
    if (rateEl) rateEl.textContent = `${d.occupancyRate ?? "--"}%`;
    const wards = d.wards || [];
    const wardCards = document.getElementById("wardPanelCards");
    if (!wardCards) return;
    if (!wards.length) { wardCards.innerHTML = ""; return; }
    wardCards.innerHTML = wards.map((w) => {
      const pct = w.totalBeds > 0 ? Math.round((w.occupiedBeds / w.totalBeds) * 100) : 0;
      const statusColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
      const wardTypeEmoji = { ICU: "🔴", EMERGENCY_TRAUMA: "🟠", GENERAL: "🟢" }[w.wardType] || "⚪";
      return `
        <div class="qx-ward-card qx-ward-card-sm">
          <div class="qx-ward-card-title-sm">${wardTypeEmoji} ${escapeHtml(w.name)}</div>
          <div class="qx-ward-card-bedcount-sm">${w.availableBeds} / ${w.totalBeds} beds available</div>
          <div class="qx-ward-progress-bar-sm"><div class="qx-ward-progress-fill-sm" style="width:${pct}%;background:${statusColor};"></div></div>
          <div class="qx-ward-card-pct-sm" style="color:${statusColor};">${pct}%</div>
        </div>`;
    }).join("");
  } catch (err) {
    const wardCards = document.getElementById("wardPanelCards");
    if (wardCards) wardCards.innerHTML = `<div class="qx-muted" style="font-size:12px;">Unable to load ward data</div>`;
  }
}

/* ---------- Tab Filtering ---------- */

function setupTabs() {
  document.querySelectorAll(".qx-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".qx-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;

      if (activeTab === "emergencies") {
        document.getElementById("tabContentQueue").style.display = "none";
        document.getElementById("tabContentWalkin").style.display = "none";
        document.getElementById("tabContentEmergencies").style.display = "";
      } else if (activeTab === "walkin") {
        document.getElementById("tabContentQueue").style.display = "none";
        document.getElementById("tabContentEmergencies").style.display = "none";
        document.getElementById("tabContentWalkin").style.display = "";
        loadWalkinHistory();
      } else {
        document.getElementById("tabContentQueue").style.display = "";
        document.getElementById("tabContentEmergencies").style.display = "none";
        document.getElementById("tabContentWalkin").style.display = "none";
        renderQueue();
      }
    });
  });
}

/* ---------- Data Loading ---------- */

async function loadQueue() {
  try {
    const res = await api("/bookings?limit=200", { auth: true });
    queue = Array.isArray(res) ? res : [];
    renderStats();
    renderQueue();
  } catch (err) {
    document.getElementById("queueTable").innerHTML =
      `<tr><td colspan="9">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function loadDoctors() {
  try {
    const res = await api("/doctors");
    doctors = res.data || [];
    renderDoctors();
  } catch (err) {
    document.getElementById("doctorsList").innerHTML =
      `<div class="qx-alert qx-alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

function renderStats() {
  const count = (s) => queue.filter((b) => b.status === s).length;
  const statMeta = {
    "Total Tokens": "🎟️",
    "Pending": "⏳",
    "Confirmed": "✅",
    "Arrived": "📍",
    "In Treatment": "🩺",
    "Completed": "🏁",
    "Rejected": "🚫",
    "No-show": "👻"
  };
  const stats = [
    ["Total Tokens", queue.length],
    ["Pending", count("PENDING_ASSISTANT")],
    ["Confirmed", count("CONFIRMED")],
    ["Arrived", count("PATIENT_ARRIVED")],
    ["In Treatment", count("IN_TREATMENT")],
    ["Completed", count("COMPLETED")],
    ["Rejected", count("REJECTED")],
    ["No-show", count("NO_SHOW")]
  ];
  document.getElementById("statsRow").innerHTML = stats
    .map(([label, num]) => `
      <div class="qx-kpi">
        <div class="qx-kpi-ico">${statMeta[label] || "📊"}</div>
        <div>
          <b>${num}</b>
          <span>${label}</span>
        </div>
      </div>`)
    .join("");
}

function renderQueue() {
  const query = (document.getElementById("asSearch").value || "").toLowerCase();
  let rows = queue;

  if (activeTab !== "all") {
    rows = rows.filter((b) => b.status === activeTab);
  }

  if (query) {
    rows = rows.filter((b) => {
      return `${b.tokenId} ${b.patientName} ${b.patientMobile} ${b.doctorName}`.toLowerCase().includes(query);
    });
  }

  const tbody = document.getElementById("queueTable");
  if (!rows.length) {
    const tabLabel = activeTab === "all" ? "" : activeTab.replace(/_/g, " ").toLowerCase();
    tbody.innerHTML = `<tr><td colspan="9" class="qx-muted qx-center">No ${tabLabel} bookings found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((b) => {
      const actions = actionButtons(b);
      return `
      <tr data-status="${escapeHtml(b.status)}">
        <td><strong>${escapeHtml(b.tokenId)}</strong></td>
        <td><strong>${escapeHtml(b.patientName)}</strong><br>
          <span class="qx-muted">${escapeHtml(b.patientMobile)}</span><br>
          <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="view" data-token="${escapeHtml(b.tokenId)}">View profile</button></td>
        <td>${escapeHtml(b.doctorName)}<br><span class="qx-muted">${escapeHtml(b.doctorDept || "")} · ${escapeHtml(b.roomNo || "")}</span></td>
        <td>${escapeHtml(b.bookingDate)}<br><span class="qx-muted">${escapeHtml(b.slotTime)}</span></td>
        <td>${estCell(b)}</td>
        <td>${b.address ? `<span class="qx-badge confirmed">${formatDistance(b.distanceKm)}</span>` : `<span class="qx-muted">-</span>`}</td>
        <td class="qx-muted">${escapeHtml((b.symptoms && b.symptoms.primary) || "-")}</td>
        <td>${statusBadge(b.status)}${b.status === "REJECTED" && b.rejectionReason
          ? `<div class="qx-muted" style="margin-top:4px;">${escapeHtml(b.rejectionReason)}</div>` : ""}</td>
        <td class="qx-action-cell"><div class="qx-action-col">${actions}</div></td>
      </tr>`;
    })
    .join("");
}

function estCell(b) {
  const inQueue = ["CONFIRMED", "PATIENT_ARRIVED"].includes(b.status) &&
    typeof b.tokensAhead === "number" && b.tokensAhead >= 0;
  const parts = [];
  if (inQueue) {
    parts.push(`<span class="qx-badge neutral">⏱ ~${b.estimatedWaitMinutes} min</span><br><span class="qx-muted">${b.tokensAhead} ahead</span>`);
  } else if (b.status === "IN_TREATMENT") {
    parts.push(`<span class="qx-badge confirmed">Now serving</span>`);
  } else {
    parts.push(`<span class="qx-muted">-</span>`);
  }
  if (b.approachAlertedAt) {
    parts.push(`<span class="qx-badge neutral">📱 Alert sent</span>`);
  }
  return parts.join("<br>");
}

function actionButtons(b) {
  const s = b.status;
  const t = escapeHtml(b.tokenId);
  const buttons = [];
  if (s === "PENDING_ASSISTANT") {
    buttons.push(`<button class="qx-btn qx-btn-success qx-btn-sm" data-action="confirm" data-token="${t}">✓ Confirm</button>`);
    buttons.push(`<button class="qx-btn qx-btn-danger qx-btn-sm" data-action="reject" data-token="${t}">✕ Reject</button>`);
    buttons.push(`<button class="qx-btn qx-btn-outline qx-btn-sm" data-action="reschedule" data-token="${t}">↻ Reschedule</button>`);
  }
  if (s === "CONFIRMED") {
    buttons.push(`<button class="qx-btn qx-btn-sm" data-action="set-status" data-token="${t}" data-status="PATIENT_ARRIVED">Patient Arrived</button>`);
    buttons.push(`<button class="qx-btn qx-btn-outline qx-btn-sm" data-action="set-status" data-token="${t}" data-status="NO_SHOW">No-show</button>`);
  }
  if (s === "PATIENT_ARRIVED") {
    buttons.push(`<button class="qx-btn qx-btn-sm" data-action="set-status" data-token="${t}" data-status="IN_TREATMENT">In Treatment</button>`);
    buttons.push(`<button class="qx-btn qx-btn-outline qx-btn-sm" data-action="set-status" data-token="${t}" data-status="NO_SHOW">No-show</button>`);
  }
  if (s === "IN_TREATMENT") {
    buttons.push(`<button class="qx-btn qx-btn-success qx-btn-sm" data-action="set-status" data-token="${t}" data-status="COMPLETED">Complete</button>`);
  }
  if (["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "COMPLETED"].includes(s)) {
    buttons.push(`<button class="qx-btn qx-btn-outline qx-btn-sm" data-action="qr" data-token="${t}">📱 QR / Pass</button>`);
  }
  if (!buttons.length) {
    return `<span class="qx-muted">-</span>`;
  }
  return buttons.join("");
}

/* ---------- Status Update ---------- */

async function setStatus(tokenId, status, message = "") {
  try {
    const body = { status };
    if (message) body.message = message;
    await api(`/bookings/${tokenId}`, {
      method: "PUT",
      auth: true,
      body
    });
    toast(`${tokenId} → ${status.replace(/_/g, " ")} — patient notified.`);
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- Reject / Reschedule ---------- */

const MESSAGE_TEMPLATES = [
  "Sorry, doctor not available, please choose another time slot.",
  "Doctor is on leave today. Please book another day.",
  "The selected time slot is full. Please choose another slot.",
  "Please visit the OPD counter to arrange a new token."
];

function openRejectModal(b) {
  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>Reject token ${escapeHtml(b.tokenId)}</h3>
    <p class="qx-muted" style="margin:4px 0 14px;">${escapeHtml(b.patientName)} · ${escapeHtml(b.doctorName)} · ${escapeHtml(b.bookingDate)} ${escapeHtml(b.slotTime)}</p>
    <div class="qx-action-form">
      <label class="qx-form-label" for="rejectMessage">Message to patient</label>
      <textarea id="rejectMessage" placeholder="Enter a custom message to the patient...">${escapeHtml(MESSAGE_TEMPLATES[0])}</textarea>
      <div class="qx-template-chips" id="rejectChips">
        ${MESSAGE_TEMPLATES.map((tpl, i) => `<button type="button" data-index="${i}" class="${i === 0 ? "selected" : ""}">${escapeHtml(tpl)}</button>`).join("")}
      </div>
    </div>
    <div class="qx-modal-actions">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Cancel</button>
      <button class="qx-btn qx-btn-danger qx-btn-sm" data-action="reject-submit" data-token="${escapeHtml(b.tokenId)}">Reject &amp; Notify</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

function rescheduleSlotOptions(b) {
  const doc = doctors.find((d) => d.name === b.doctorName);
  const slots = (doc && doc.opdSlots && doc.opdSlots.length) ? doc.opdSlots
    : ["09:00 AM - 11:00 AM", "11:00 AM - 01:00 PM", "02:00 PM - 04:00 PM", "04:00 PM - 06:00 PM"];
  return slots.map((slot) =>
    `<option value="${escapeHtml(slot)}" ${slot === b.slotTime ? "selected" : ""}>${escapeHtml(slot)}</option>`
  ).join("");
}

function openRescheduleModal(b) {
  const today = new Date().toISOString().split("T")[0];
  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>Reschedule token ${escapeHtml(b.tokenId)}</h3>
    <p class="qx-muted" style="margin:4px 0 14px;">${escapeHtml(b.patientName)} · ${escapeHtml(b.doctorName)} · currently ${escapeHtml(b.bookingDate)} ${escapeHtml(b.slotTime)}</p>
    <div class="qx-action-form">
      <div class="qx-form-row">
        <div>
          <label class="qx-form-label" for="reschedDate">New date</label>
          <input type="date" id="reschedDate" value="${escapeHtml(b.bookingDate)}" min="${today}">
        </div>
        <div>
          <label class="qx-form-label" for="reschedSlot">New time slot</label>
          <select id="reschedSlot">${rescheduleSlotOptions(b)}</select>
        </div>
      </div>
      <label class="qx-form-label" for="reschedMessage">Message to patient (custom)</label>
      <textarea id="reschedMessage" placeholder="Optional message...">${escapeHtml(MESSAGE_TEMPLATES[0])}</textarea>
      <div class="qx-template-chips" id="reschedChips">
        ${MESSAGE_TEMPLATES.map((tpl, i) => `<button type="button" data-index="${i}" class="${i === 0 ? "selected" : ""}">${escapeHtml(tpl)}</button>`).join("")}
      </div>
    </div>
    <div class="qx-modal-actions">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Cancel</button>
      <button class="qx-btn qx-btn-sm" data-action="reschedule-submit" data-token="${escapeHtml(b.tokenId)}">Reschedule &amp; Notify</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

async function submitReject(tokenId) {
  const message = (document.getElementById("rejectMessage").value || "").trim();
  if (!message) {
    toast("Please enter a reason/message for the patient before rejecting.");
    return;
  }
  try {
    await api(`/bookings/${tokenId}`, {
      method: "PUT",
      auth: true,
      body: { status: "REJECTED", message }
    });
    closeModal();
    toast(`${tokenId} rejected and patient notified.`);
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

async function submitReschedule(tokenId) {
  const bookingDate = document.getElementById("reschedDate").value;
  const slotTime = document.getElementById("reschedSlot").value;
  const message = (document.getElementById("reschedMessage").value || "").trim();
  if (!bookingDate || !slotTime) {
    toast("Please choose a new date and time slot.");
    return;
  }
  try {
    await api(`/bookings/${tokenId}`, {
      method: "PUT",
      auth: true,
      body: { reschedule: { bookingDate, slotTime }, message }
    });
    closeModal();
    toast(`${tokenId} rescheduled to ${bookingDate} ${slotTime}.`);
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- Patient Profile ---------- */

function viewPatient(b) {
  const med = b.medicalHistory || {};
  const conditions = (med.preExistingConditions || []).join(", ") || "None";
  const photo = b.profilePhoto
    ? `<img src="${escapeHtml(b.profilePhoto)}" alt="Patient" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`
    : `<div class="qx-avatar" style="width:80px;height:80px;font-size:34px;">${escapeHtml((b.patientName || "P").charAt(0).toUpperCase())}</div>`;
  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>Patient Profile</h3>
    <div class="qx-flex qx-wrap qx-mb">
      ${photo}
      <div>
        <strong style="font-size:18px;">${escapeHtml(b.patientName)}</strong>
        <div class="qx-muted">${escapeHtml(b.patientMobile)}</div>
        <div class="qx-muted">${escapeHtml(b.patientEmail)}</div>
      </div>
    </div>
    ${b.address ? `
    <div class="qx-flex qx-wrap qx-mb">
      <div class="qx-card" style="flex:1;background:#f8fafc;">
        <strong>Address:</strong> ${escapeHtml(b.address)}<br>
        <span class="qx-badge confirmed qx-mt">${formatDistance(b.distanceKm)} from hospital</span>
      </div>
    </div>` : ""}
    <div class="qx-card" style="background:#f8fafc;">
      <h4 style="margin-top:0;">Medical Information</h4>
      <div class="qx-grid qx-grid-2">
        <div><strong>Blood Pressure:</strong> ${escapeHtml(med.bloodPressure || "Normal")}</div>
        <div><strong>Allergies:</strong> ${escapeHtml(med.allergies || "No")}</div>
        <div><strong>Past Surgeries:</strong> ${escapeHtml(med.pastSurgeries || "No")}</div>
        <div><strong>Conditions:</strong> ${escapeHtml(conditions)}</div>
        <div><strong>Main Problem:</strong> ${escapeHtml(med.currentProblem || "-")}</div>
        <div><strong>Severity:</strong> ${escapeHtml(med.severity || "Mild")} · <strong>Duration:</strong> ${escapeHtml(med.problemDuration || "-")}</div>
      </div>
      ${med.otherNotes ? `<div class="qx-mt"><strong>Notes:</strong> ${escapeHtml(med.otherNotes)}</div>` : ""}
    </div>
    <div class="qx-mt">
      <strong>Booking:</strong> ${escapeHtml(b.tokenId)} · ${escapeHtml(b.doctorName)} · ${escapeHtml(b.bookingDate)} ${escapeHtml(b.slotTime)}<br>
      ${statusBadge(b.status)}
      ${["CONFIRMED", "PATIENT_ARRIVED"].includes(b.status) && typeof b.tokensAhead === "number" && b.tokensAhead >= 0
        ? `<span class="qx-badge neutral">⏱ Est. wait ~${b.estimatedWaitMinutes} min · ${b.tokensAhead} ahead</span>` : ""}
      ${b.approachAlertedAt ? `<span class="qx-badge neutral">📱 Approaching alert sent</span>` : ""}
    </div>
    <div class="qx-mt">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Close</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

/* ---------- Modal ---------- */

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("show");
}

/* ---------- Walk-in Token Modal ---------- */

function openWalkinModal() {
  const today = new Date().toISOString().split("T")[0];
  const deptOptions = doctors.length
    ? [...new Set(doctors.map((d) => d.department))].map((d) =>
      `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("")
    : `<option value="General Medicine">General Medicine</option>`;

  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>🏥 Generate Walk-in Token</h3>
    <p class="qx-muted" style="margin:4px 0 14px;">Register an offline/walk-in patient and generate an active token instantly.</p>
    <div class="qx-action-form">
      <div class="qx-form-row">
        <div>
          <label class="qx-form-label" for="walkinName">Patient Name *</label>
          <input type="text" id="walkinName" placeholder="Enter patient name" required>
        </div>
        <div>
          <label class="qx-form-label" for="walkinMobile">Mobile Number *</label>
          <input type="tel" id="walkinMobile" placeholder="Enter mobile number" required>
        </div>
      </div>
      <div class="qx-form-row">
        <div>
          <label class="qx-form-label" for="walkinAge">Age</label>
          <input type="number" id="walkinAge" placeholder="Age" min="0" max="120">
        </div>
        <div>
          <label class="qx-form-label" for="walkinEmail">Email (optional)</label>
          <input type="email" id="walkinEmail" placeholder="patient@email.com">
        </div>
      </div>
      <div class="qx-form-row">
        <div>
          <label class="qx-form-label" for="walkinDept">Department</label>
          <select id="walkinDept">${deptOptions}</select>
        </div>
        <div>
          <label class="qx-form-label" for="walkinSlot">Time Slot</label>
          <select id="walkinSlot">
            <option value="09:00 AM - 11:00 AM">09:00 AM - 11:00 AM</option>
            <option value="11:00 AM - 01:00 PM">11:00 AM - 01:00 PM</option>
            <option value="02:00 PM - 04:00 PM">02:00 PM - 04:00 PM</option>
            <option value="04:00 PM - 06:00 PM">04:00 PM - 06:00 PM</option>
          </select>
        </div>
      </div>
      <div>
        <label class="qx-form-label" for="walkinSymptoms">Symptom / Chief Complaint</label>
        <textarea id="walkinSymptoms" placeholder="Enter primary symptom or reason for visit..." style="min-height:60px;"></textarea>
      </div>
    </div>
    <div class="qx-modal-actions">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Cancel</button>
      <button class="qx-btn qx-btn-success qx-btn-sm" data-action="walkin-submit">🎟️ Generate Token</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
  setTimeout(() => {
    const nameInput = document.getElementById("walkinName");
    if (nameInput) nameInput.focus();
  }, 100);
}

async function submitWalkinToken() {
  const name = (document.getElementById("walkinName").value || "").trim();
  const mobile = (document.getElementById("walkinMobile").value || "").trim();
  const age = document.getElementById("walkinAge").value;
  const email = (document.getElementById("walkinEmail").value || "").trim();
  const dept = document.getElementById("walkinDept").value;
  const slot = document.getElementById("walkinSlot").value;
  const symptoms = (document.getElementById("walkinSymptoms").value || "").trim();

  if (!name || !mobile) {
    toast("Patient name and mobile number are required.");
    return;
  }

  try {
    const res = await api("/assistant/walkin-token", {
      method: "POST",
      auth: true,
      body: {
        patientName: name,
        patientMobile: mobile,
        patientAge: age || undefined,
        patientEmail: email || undefined,
        doctorDept: dept,
        slotTime: slot,
        symptoms: symptoms || "Walk-in consultation",
        bookingDate: new Date().toISOString().split("T")[0]
      }
    });

    const tokenData = res.data || res;
    closeModal();
    toast(`✅ Walk-in token ${tokenData.tokenId} generated for ${name}!`);

    showWalkinPass(tokenData);
    await refresh();
    loadLiveStats();
  } catch (err) {
    toast(err.message);
  }
}

function showWalkinPass(tokenData) {
  const symptoms = (tokenData.symptoms && tokenData.symptoms.primary) || tokenData.symptoms || "Walk-in consultation";
  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>✅ Token Generated Successfully</h3>
    <div class="qx-walkin-pass">
      <div class="qx-walkin-pass-header">
        <span class="qx-brand-badge">🏥</span>
        <div>
          <strong>QueueX Walk-in Token</strong>
          <small>New Civil Hospital, Surat</small>
        </div>
      </div>
      <div class="qx-walkin-token-number">${escapeHtml(tokenData.tokenId)}</div>
      <div class="qx-walkin-pass-body">
        <div class="qx-walkin-pass-grid">
          <div><span>Patient</span><b>${escapeHtml(tokenData.patientName)}</b></div>
          <div><span>Mobile</span><b>${escapeHtml(tokenData.patientMobile)}</b></div>
          <div><span>Doctor</span><b>${escapeHtml(tokenData.doctorName)}</b></div>
          <div><span>Department</span><b>${escapeHtml(tokenData.doctorDept)}</b></div>
          <div><span>Date</span><b>${escapeHtml(tokenData.bookingDate)}</b></div>
          <div><span>Time Slot</span><b>${escapeHtml(tokenData.slotTime)}</b></div>
          <div><span>Symptoms</span><b>${escapeHtml(symptoms)}</b></div>
          <div><span>Status</span><b><span class="qx-badge confirmed">Active</span></b></div>
        </div>
      </div>
      <div class="qx-walkin-pass-note">
        Show this token at the OPD counter. The patient can use this token ID for future reference and follow-ups.
      </div>
    </div>
    <div class="qx-modal-actions">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Close</button>
      <button class="qx-btn qx-btn-outline qx-btn-sm qx-walkin-dl-btn" data-action="walkin-download" data-token-id="${escapeHtml(tokenData.tokenId)}">📥 Download PDF</button>
      <button class="qx-btn qx-btn-success qx-btn-sm" data-action="walkin-print" data-token-id="${escapeHtml(tokenData.tokenId)}" data-patient-name="${escapeHtml(tokenData.patientName)}" data-patient-mobile="${escapeHtml(tokenData.patientMobile)}" data-doctor-name="${escapeHtml(tokenData.doctorName)}" data-doctor-dept="${escapeHtml(tokenData.doctorDept)}" data-booking-date="${escapeHtml(tokenData.bookingDate)}" data-slot-time="${escapeHtml(tokenData.slotTime)}" data-symptoms="${escapeHtml(symptoms)}">🖨 Print Pass</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
}

function printWalkinPass(btn) {
  const data = btn.dataset;
  const win = window.open("", "_blank", "width=420,height=600");
  if (!win) {
    toast("Please allow pop-ups to print the token.");
    return;
  }
  const symptoms = data.symptoms || "Walk-in consultation";
  const body = `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Walk-in Token ${data.tokenId}</title>
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
      <div class="head"><div class="brand">🏥 QueueX<small>New Civil Hospital, Surat</small></div><div class="token">${escapeHtml(data.tokenId)}</div></div>
      <div class="body">
        <div class="info"><span>Patient Name</span><b>${escapeHtml(data.patientName)}</b></div>
        <div class="info"><span>Mobile</span><b>${escapeHtml(data.patientMobile)}</b></div>
        <table>
          <tr><td><span>Doctor</span><b>${escapeHtml(data.doctorName)}</b></td><td><span>Department</span><b>${escapeHtml(data.doctorDept)}</b></td></tr>
          <tr><td><span>Date</span><b>${escapeHtml(data.bookingDate)}</b></td><td><span>Time Slot</span><b>${escapeHtml(data.slotTime)}</b></td></tr>
          <tr><td colspan="2"><span>Status</span><b style="color:#059669;">ACTIVE</b></td></tr>
        </table>
        <div class="symptoms"><span>Symptoms / Chief Complaint</span><b>${escapeHtml(symptoms)}</b></div>
      </div>
    </div>
    <div class="footer">QueueX · New Civil Hospital, Surat</div></body></html>`;
  win.document.open();
  win.document.write(body);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

/* ---------- Walk-in Pass Download ---------- */

function downloadWalkinPassPdf(tokenId) {
  const token = getToken();
  const url = `${API_BASE}/assistant/walkin-pass/${encodeURIComponent(tokenId)}/pdf`;
  toast("Generating walk-in pass PDF...");
  fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to download pass");
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `walkin-pass-${tokenId}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        try { document.body.removeChild(a); } catch (e) { /* silent */ }
      }, 100);
      toast("Walk-in pass downloaded successfully.");
    })
    .catch((err) => {
      toast(err.message || "Failed to download walk-in pass.");
    });
}

/* ---------- Walk-in History ---------- */

async function loadWalkinHistory() {
  try {
    const res = await api("/assistant/walkin-history", { auth: true });
    walkinHistory = Array.isArray(res.data) ? res.data : (res.data || []);
    renderWalkinHistory();
  } catch (err) {
    document.getElementById("walkinHistoryList").innerHTML =
      `<div class="qx-alert qx-alert-danger" style="margin:16px;">${escapeHtml(err.message)}</div>`;
  }
}

function renderWalkinHistory() {
  const el = document.getElementById("walkinHistoryList");
  if (!el) return;
  if (!walkinHistory.length) {
    el.innerHTML = `<div class="qx-muted qx-center" style="padding:24px;">No offline / walk-in patients found. Generated walk-in tokens will appear here.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="qx-table-wrap">
      <table class="qx-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Patient Name</th>
            <th>Mobile</th>
            <th>Department</th>
            <th>Date &amp; Slot</th>
            <th>Symptoms</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${walkinHistory.map((b) => {
            const symptoms = (b.symptoms && b.symptoms.primary) || "Walk-in consultation";
            const time = b.createdAt ? new Date(b.createdAt).toLocaleString("en-IN") : "-";
            return `
            <tr data-status="${escapeHtml(b.status)}">
              <td><strong>${escapeHtml(b.tokenId)}</strong></td>
              <td>
                <strong>${escapeHtml(b.patientName)}</strong>
              </td>
              <td><span class="qx-muted">${escapeHtml(b.patientMobile)}</span></td>
              <td>${escapeHtml(b.doctorDept || "-")}</td>
              <td>${escapeHtml(b.bookingDate)}<br><span class="qx-muted">${escapeHtml(b.slotTime)}</span></td>
              <td class="qx-muted" style="max-width:180px;">${escapeHtml(symptoms)}</td>
              <td>${statusBadge(b.status)}</td>
              <td class="qx-action-cell">
                <div class="qx-action-col">
                  <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="walkin-dl-pass" data-token-id="${escapeHtml(b.tokenId)}">📥 Download Pass</button>
                  <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="walkin-reprint" data-token-id="${escapeHtml(b.tokenId)}" data-patient-name="${escapeHtml(b.patientName)}" data-patient-mobile="${escapeHtml(b.patientMobile)}" data-doctor-name="${escapeHtml(b.doctorName)}" data-doctor-dept="${escapeHtml(b.doctorDept)}" data-booking-date="${escapeHtml(b.bookingDate)}" data-slot-time="${escapeHtml(b.slotTime)}" data-symptoms="${escapeHtml(symptoms)}">🖨 Re-print</button>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

/* ---------- Analytics ---------- */

function toggleAnalytics() {
  const panel = document.getElementById("analyticsPanel");
  if (panel.style.display === "none") {
    panel.style.display = "";
    loadAnalytics(analyticsPeriod);
  } else {
    panel.style.display = "none";
  }
}

async function loadAnalytics(period) {
  analyticsPeriod = period;
  document.querySelectorAll(".analytics-period").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.period === period);
    if (btn.dataset.period === period) {
      btn.style.background = "var(--qx-grad-btn)";
      btn.style.color = "#fff";
      btn.style.borderColor = "transparent";
    } else {
      btn.style.background = "";
      btn.style.color = "";
      btn.style.borderColor = "";
    }
  });

  try {
    const res = await api(`/assistant/analytics?period=${period}`, { auth: true });
    analyticsData = res.data || res;
    renderAnalytics();
  } catch (err) {
    document.getElementById("analyticsContent").innerHTML =
      `<div class="qx-alert qx-alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

function renderAnalytics() {
  const d = analyticsData;
  if (!d) return;

  const statusColors = {
    PENDING_ASSISTANT: "#f59e0b",
    CONFIRMED: "#10b981",
    PATIENT_ARRIVED: "#3b82f6",
    IN_TREATMENT: "#6366f1",
    COMPLETED: "#059669",
    REJECTED: "#ef4444",
    CANCELLED: "#94a3b8",
    NO_SHOW: "#a855f7"
  };

  let html = `<div class="qx-analytics-summary qx-mb">`;
  html += `<div class="qx-analytics-kpi"><div class="qx-analytics-kpi-num">${d.totalBookings}</div><div class="qx-analytics-kpi-label">Total Bookings</div></div>`;
  for (const [status, count] of Object.entries(d.statusCounts || {})) {
    html += `<div class="qx-analytics-kpi"><div class="qx-analytics-kpi-num" style="color:${statusColors[status] || "#334155"}">${count}</div><div class="qx-analytics-kpi-label">${status.replace(/_/g, " ").toLowerCase()}</div></div>`;
  }
  html += `</div>`;

  if (d.dailyBreakdown && d.dailyBreakdown.length) {
    const maxTotal = Math.max(...d.dailyBreakdown.map((day) => day.total), 1);
    html += `<div class="qx-analytics-section"><h4>Daily Breakdown</h4>`;
    html += `<div class="qx-chart-bars">`;
    for (const day of d.dailyBreakdown) {
      const height = Math.max(4, (day.total / maxTotal) * 100);
      let barSegments = "";
      let yOffset = 0;
      for (const [status, count] of Object.entries(day)) {
        if (["date", "label", "total"].includes(status) || !count) continue;
        const segHeight = (count / Math.max(day.total, 1)) * height;
        barSegments += `<div class="qx-bar-seg" style="height:${segHeight}%;background:${statusColors[status] || "#94a3b8"};bottom:${yOffset}%;" title="${status.replace(/_/g, " ")}: ${count}"></div>`;
        yOffset += segHeight;
      }
      html += `<div class="qx-chart-bar-col">
        <div class="qx-chart-bar" style="height:${height}%;">
          ${barSegments}
          <div class="qx-chart-bar-val">${day.total}</div>
        </div>
        <div class="qx-chart-bar-label">${escapeHtml(day.label.split(" ").slice(0, 2).join(" "))}</div>
      </div>`;
    }
    html += `</div></div>`;
  }

  if (d.weeklyBreakdown && d.weeklyBreakdown.length) {
    html += `<div class="qx-analytics-section"><h4>Weekly Breakdown</h4>`;
    html += `<div class="qx-weekly-grid">`;
    for (const week of d.weeklyBreakdown) {
      html += `<div class="qx-weekly-card">
        <div class="qx-weekly-header">${escapeHtml(week.label)}</div>
        <div class="qx-weekly-stats">
          <div><b>${week.total}</b><span>Total</span></div>
          <div><b style="color:#059669;">${week.completed}</b><span>Completed</span></div>
          <div><b style="color:#f59e0b;">${week.pending}</b><span>Pending</span></div>
          <div><b style="color:#ef4444;">${week.rejected}</b><span>Rejected</span></div>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }

  if (d.doctorBreakdown && d.doctorBreakdown.length) {
    html += `<div class="qx-analytics-section"><h4>Top Doctors by Volume</h4>`;
    html += `<div class="qx-table-wrap"><table class="qx-table"><thead><tr><th>Doctor</th><th>Total Tokens</th><th>Completed</th><th>Completion Rate</th></tr></thead><tbody>`;
    for (const doc of d.doctorBreakdown) {
      const rate = doc.total > 0 ? Math.round((doc.completed / doc.total) * 100) : 0;
      html += `<tr>
        <td><strong>${escapeHtml(doc.name)}</strong></td>
        <td>${doc.total}</td>
        <td>${doc.completed}</td>
        <td><span class="qx-badge ${rate >= 70 ? "confirmed" : rate >= 40 ? "pending" : "rejected"}">${rate}%</span></td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  }

  document.getElementById("analyticsContent").innerHTML = html;
}

/* ---------- Emergency SOS handling ---------- */

const SEVERITY_CSS_MAP = {
  MODERATE: "moderate",
  SERIOUS: "serious",
  CRITICAL: "critical"
};

function playEmergencyBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, startDelay, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + duration);
    };
    playTone(880, 0, 0.2);
    playTone(1100, 0.22, 0.2);
    playTone(880, 0.44, 0.2);
    playTone(1100, 0.66, 0.2);
  } catch (e) { /* silent */ }
}

function showEmergencyBanner(data) {
  const banner = document.getElementById("emergencyBanner");
  const details = document.getElementById("emergencyDetails");
  const severityBadge = document.getElementById("emergencySeverityBadge");
  const locationInfo = document.getElementById("emergencyLocationInfo");
  activeEmergencyAlert = data;
  const time = data.triggeredAt ? new Date(data.triggeredAt).toLocaleTimeString("en-IN") : new Date().toLocaleTimeString("en-IN");

  details.innerHTML = `
    <div class="qx-emergency-banner-info">
      <span><strong>Patient:</strong> ${escapeHtml(data.patientName || "Unknown")}</span>
      <span><strong>Mobile:</strong> ${escapeHtml(data.patientMobile || "-")}</span>
      <span><strong>Email:</strong> ${escapeHtml(data.patientEmail || "-")}</span>
      ${data.tokenId ? `<span><strong>Token:</strong> ${escapeHtml(data.tokenId)}</span>` : ""}
      <span><strong>Time:</strong> ${escapeHtml(time)}</span>
    </div>`;

  if (data.severity) {
    const severityClass = SEVERITY_CSS_MAP[data.severity] || "moderate";
    const severityLabel = data.severityLabel || data.severity.replace(/_/g, " ");
    severityBadge.textContent = severityLabel;
    severityBadge.className = `qx-emergency-banner-severity ${severityClass}`;
    severityBadge.classList.remove("qx-hide");
  } else {
    severityBadge.classList.add("qx-hide");
  }

  if (data.customAddress || data.distanceKm != null) {
    let locHtml = "";
    if (data.customAddress) {
      locHtml += `<span>📍 ${escapeHtml(data.customAddress)}</span>`;
    }
    if (data.distanceKm != null) {
      locHtml += `<span class="loc-distance">📏 ${escapeHtml(String(data.distanceKm))} km from hospital</span>`;
    }
    if (data.estimatedTravelMinutes != null) {
      locHtml += `<span class="loc-eta">⏱ ~${escapeHtml(String(data.estimatedTravelMinutes))} min ETA</span>`;
    }
    locationInfo.innerHTML = locHtml;
    locationInfo.classList.remove("qx-hide");
  } else {
    locationInfo.classList.add("qx-hide");
  }

  banner.classList.remove("qx-hide");
  playEmergencyBeep();
  toast(`🚨 EMERGENCY SOS from ${data.patientName || "Unknown patient"}!`);
}

function hideEmergencyBanner() {
  const banner = document.getElementById("emergencyBanner");
  banner.classList.add("qx-hide");
  activeEmergencyAlert = null;
}

function openConfirmEmergencyModal() {
  if (!activeEmergencyAlert) {
    toast("No active emergency to confirm.");
    return;
  }
  const modal = document.getElementById("modalBody");
  modal.innerHTML = `
    <h3>🚨 Confirm Emergency &amp; Assign Room</h3>
    <p class="qx-muted" style="margin:4px 0 14px;">
      Patient: <strong>${escapeHtml(activeEmergencyAlert.patientName || "Unknown")}</strong>
      ${activeEmergencyAlert.tokenId ? ` · Token: <strong>${escapeHtml(activeEmergencyAlert.tokenId)}</strong>` : ""}
      ${activeEmergencyAlert.severity ? ` · Severity: <strong>${escapeHtml(activeEmergencyAlert.severityLabel || activeEmergencyAlert.severity)}</strong>` : ""}
    </p>
    ${activeEmergencyAlert.customAddress || activeEmergencyAlert.distanceKm != null ? `
    <div style="padding:8px 12px;border-radius:8px;background:#f0f9ff;border:1px solid #bae6fd;margin-bottom:14px;font-size:12px;color:#0369a1;font-weight:600;">
      ${activeEmergencyAlert.customAddress ? `📍 ${escapeHtml(activeEmergencyAlert.customAddress)}` : ""}
      ${activeEmergencyAlert.distanceKm != null ? ` · 📏 ${escapeHtml(String(activeEmergencyAlert.distanceKm))} km` : ""}
      ${activeEmergencyAlert.estimatedTravelMinutes != null ? ` · ⏱ ~${escapeHtml(String(activeEmergencyAlert.estimatedTravelMinutes))} min` : ""}
    </div>` : ""}
    <div class="qx-action-form">
      <div class="qx-form-row">
        <div>
          <label class="qx-form-label" for="confirmRoom">Target Room *</label>
          <select id="confirmRoom" required>
            <option value="" disabled selected>Select room…</option>
            <option value="Room 101 - General Emergency">Room 101 - General Emergency</option>
            <option value="Room 102 - Trauma Care">Room 102 - Trauma Care</option>
            <option value="Room 105 - Cardiac ICU">Room 105 - Cardiac ICU</option>
            <option value="Room 201 - Pediatrics Emergency">Room 201 - Pediatrics Emergency</option>
            <option value="Room 302 - Main Triage &amp; Observation">Room 302 - Main Triage &amp; Observation</option>
            <option value="Room 305 - Surgical Ward">Room 305 - Surgical Ward</option>
          </select>
        </div>
        <div>
          <label class="qx-form-label" for="confirmAmbulance">Ambulance Fleet (optional)</label>
          <select id="confirmAmbulance">
            <option value="" selected>Select ambulance…</option>
            <option value="GJ-05-AB-1234 (ALS - Advanced Life Support)">GJ-05-AB-1234 (ALS)</option>
            <option value="GJ-05-AB-8251 (BLS - Basic Life Support)">GJ-05-AB-8251 (BLS)</option>
            <option value="GJ-05-CD-5678 (Cardiac Ambulance 1)">GJ-05-CD-5678 (Cardiac 1)</option>
            <option value="GJ-05-EF-9012 (Trauma Ambulance 2)">GJ-05-EF-9012 (Trauma 2)</option>
            <option value="GJ-05-GH-3456 (Emergency Van 3)">GJ-05-GH-3456 (Emergency Van 3)</option>
            <option value="GJ-05-IJ-7890 (Quick Response Unit A)">GJ-05-IJ-7890 (Quick Response A)</option>
            <option value="GJ-05-KL-2345 (ICU Mobile Unit 1)">GJ-05-KL-2345 (ICU Mobile 1)</option>
            <option value="GJ-05-MN-6789 (Disaster Response Van)">GJ-05-MN-6789 (Disaster Response)</option>
            <option value="GJ-05-OP-4321 (General Ambulance 4)">GJ-05-OP-4321 (General 4)</option>
            <option value="GJ-05-QR-8765 (Emergency Support Vehicle)">GJ-05-QR-8765 (Support Vehicle)</option>
          </select>
        </div>
      </div>
      <label class="qx-form-label" for="confirmInstructions">Emergency Instructions (optional)</label>
      <select id="confirmInstructions">
        <option value="" selected>Select preset instructions…</option>
        <option value="Patient requires immediate cardiac assessment. Prepare ECG, BP monitor, and oxygen support upon arrival.">Cardiac — ECG, BP monitor, oxygen</option>
        <option value="Severe trauma and accident case. Keep emergency surgical kit, IV fluids, and stretcher ready at entrance.">Trauma — surgical kit, IV, stretcher</option>
        <option value="High fever and respiratory distress. Keep nebulizer and isolation setup ready in the assigned room.">Respiratory — nebulizer, isolation</option>
        <option value="Pediatric emergency case. Assign pediatric specialist and keep child-friendly emergency kit ready.">Pediatric — specialist, child kit</option>
        <option value="General urgent consultation and stabilization required. Direct patient immediately to assigned room.">General — consultation &amp; stabilization</option>
      </select>
    </div>
    <div class="qx-modal-actions">
      <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="close">Cancel</button>
      <button class="qx-btn qx-btn-danger qx-btn-sm" data-action="confirm-emergency-submit">✓ Confirm &amp; Assign</button>
    </div>`;
  document.getElementById("modalBackdrop").classList.add("show");
  setTimeout(() => {
    const roomSelect = document.getElementById("confirmRoom");
    if (roomSelect) roomSelect.focus();
  }, 100);
}

async function submitConfirmEmergency() {
  const room = (document.getElementById("confirmRoom").value || "").trim();
  if (!room) {
    toast("Please select a target room.");
    return;
  }
  const ambulance = (document.getElementById("confirmAmbulance").value || "").trim();
  const instructions = (document.getElementById("confirmInstructions").value || "").trim();

  try {
    const res = await api("/emergency/confirm", {
      method: "POST",
      auth: true,
      body: {
        alertId: activeEmergencyAlert.alertId,
        roomNumber: room,
        ambulanceNumber: ambulance,
        instructions: instructions
      }
    });
    closeModal();
    hideEmergencyBanner();
    toast(`✅ ${res.message || "Emergency confirmed. Digital pass available for patient."}`);
  } catch (err) {
    toast(err.message);
  }
}

function downloadEmergencyPass(alertId) {
  const token = getToken();
  const url = `${API_BASE}/emergency/${alertId}/pass`;
  toast("Generating emergency pass PDF...");
  fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to download pass");
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `emergency-pass-${alertId}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        try { document.body.removeChild(a); } catch (e) { /* silent */ }
      }, 100);
      toast("Emergency pass downloaded successfully.");
    })
    .catch((err) => {
      toast(err.message || "Failed to download emergency pass.");
    });
}

async function dismissFalseAlarm() {
  if (!activeEmergencyAlert) {
    toast("No active emergency to dismiss.");
    return;
  }
  const reason = prompt("Dismiss reason (optional):", "False alarm — verified safe") || "False alarm";
  try {
    await api(`/emergency/${activeEmergencyAlert.alertId}/dismiss`, {
      method: "PUT",
      auth: true,
      body: { reason }
    });
    hideEmergencyBanner();
    toast("Emergency alert dismissed.");
  } catch (err) {
    toast(err.message);
  }
}

async function loadActiveEmergencyAlerts() {
  try {
    const res = await api("/emergency", { auth: true });
    const alerts = Array.isArray(res.data) ? res.data : (res.data || []);
    if (alerts.length > 0) {
      const latest = alerts[0];
      showEmergencyBanner({
        alertId: latest._id,
        patientName: latest.patientName,
        patientMobile: latest.patientMobile,
        patientEmail: latest.patientEmail,
        tokenId: latest.tokenId,
        severity: latest.severity,
        severityLabel: latest.severity ? (latest.severity.replace(/_/g, " ")) : "",
        customAddress: latest.customAddress,
        distanceKm: latest.distanceKm,
        estimatedTravelMinutes: latest.estimatedTravelMinutes,
        triggeredAt: latest.triggeredAt
      });
    }
  } catch (err) { /* silent */ }
}

async function loadConfirmedEmergencies() {
  try {
    const res = await api("/emergency/history", { auth: true });
    confirmedEmergencies = Array.isArray(res.data) ? res.data : (res.data || []);
    renderConfirmedEmergencies();
  } catch (err) {
    const el = document.getElementById("confirmedEmergenciesTable");
    if (el) {
      el.innerHTML = `<tr><td colspan="10"><div class="qx-alert qx-alert-danger">${escapeHtml(err.message)}</div></td></tr>`;
    }
  }
}

function renderConfirmedEmergencies() {
  const tbody = document.getElementById("confirmedEmergenciesTable");
  if (!tbody) return;
  if (!confirmedEmergencies.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="qx-muted qx-center" style="padding:24px;">No confirmed emergencies yet. Confirmed cases will appear here.</td></tr>`;
    return;
  }
  const severityCssMap = { MODERATE: "moderate", SERIOUS: "serious", CRITICAL: "critical" };
  const severityLabels = { MODERATE: "Moderate / Stable", SERIOUS: "Serious / Urgent", CRITICAL: "Critical / Severe" };

  tbody.innerHTML = confirmedEmergencies.map((a) => {
    const time = a.confirmedAt ? new Date(a.confirmedAt).toLocaleString("en-IN") : "-";
    const sevClass = severityCssMap[a.severity] || "moderate";
    const sevLabel = severityLabels[a.severity] || (a.severity || "MODERATE").replace(/_/g, " ");
    const isAdmitted = a.status === "ADMITTED";
    return `
    <tr>
      <td><strong>${escapeHtml(a.tokenId || "-")}</strong></td>
      <td>
        <strong>${escapeHtml(a.patientName || "-")}</strong><br>
        <span class="qx-muted">${escapeHtml(a.patientMobile || "")}</span>
      </td>
      <td><span class="qx-severity-badge ${sevClass}">${escapeHtml(sevLabel)}</span></td>
      <td>
        ${a.customAddress ? `<div class="qx-emergency-address" title="${escapeHtml(a.customAddress)}">${escapeHtml(a.customAddress)}</div>` : ""}
        ${a.distanceKm != null ? `<div class="qx-emergency-distance">📏 ${escapeHtml(String(a.distanceKm))} km</div>` : ""}
        ${a.estimatedTravelMinutes != null ? `<div class="qx-emergency-eta">⏱ ~${escapeHtml(String(a.estimatedTravelMinutes))} min</div>` : ""}
      </td>
      <td><span class="qx-badge confirmed">${escapeHtml(a.roomNumber || "-")}</span></td>
      <td>${escapeHtml(a.ambulanceNumber || "-")}</td>
      <td class="qx-muted" style="max-width:180px;">${escapeHtml(a.instructions || "-")}</td>
      <td>${isAdmitted
        ? `<span class="qx-badge admitted">ADMITTED</span>`
        : `<span class="qx-badge confirmed">CONFIRMED</span>`}</td>
      <td class="qx-muted">${escapeHtml(time)}</td>
      <td>
        <div class="qx-action-col">
          <button class="qx-btn qx-btn-outline qx-btn-sm" data-action="emergency-pass" data-alert-id="${escapeHtml(a._id)}">📥 Pass</button>
          ${!isAdmitted ? `
          <button class="qx-btn qx-btn-success qx-btn-sm" data-action="admit-emergency" data-alert-id="${escapeHtml(a._id)}" data-patient-name="${escapeHtml(a.patientName || "")}">✅ Arrived & Admitted</button>
          ` : ""}
        </div>
      </td>
    </tr>`;
  }).join("");
}

async function admitEmergencyPatient(alertId, patientName) {
  if (!confirm(`Mark ${patientName} as Arrived & Admitted?\n\nThis will lock their Emergency SOS button for 3 days.`)) {
    return;
  }
  try {
    const res = await api("/emergency/admit", {
      method: "POST",
      auth: true,
      body: { alertId }
    });
    toast(`✅ ${res.message || patientName + " admitted. SOS locked for 3 days."}`);
    await loadConfirmedEmergencies();
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- Doctors ---------- */

function renderDoctors() {
  const el = document.getElementById("doctorsList");
  if (!doctors.length) {
    el.innerHTML = `<div class="qx-alert qx-alert-info">No doctors available.</div>`;
    return;
  }
  el.innerHTML = doctors
    .map((doc) => {
      const unavailable = doc.status && doc.status !== "AVAILABLE";
      return `
      <div class="qx-card qx-doc-card">
        <div class="qx-doc-top">
          <div class="qx-doc-avatar ${unavailable ? "off" : ""}">
            ${doctorAvatar(doc)}
            <span class="qx-doc-status-dot ${unavailable ? "off" : ""}"></span>
          </div>
          <div>
            <h4 class="qx-doc-name">${escapeHtml(doc.name)}</h4>
            <div class="qx-doc-dept">${escapeHtml(doc.department || "General Medicine")} · Room ${escapeHtml(doc.room || "-")}</div>
          </div>
        </div>
        <div class="qx-doc-spec">${escapeHtml(doc.specialization || doc.qualification || "Consultant Specialist")}</div>
        <div class="qx-doc-meta">
          <span>🕘 <b>${escapeHtml((doc.opdSlots || []).join(", ") || doc.opdTime || "OPD")}</b></span>
          <span>🏥 ${escapeHtml(doc.department || "-")}</span>
        </div>
        <div class="qx-doc-footer">
          ${unavailable
            ? `<span class="qx-badge rejected">${escapeHtml(doc.status.replace(/_/g, " "))}</span>`
            : `<span class="qx-badge confirmed">● Available</span>`}
          ${unavailable
            ? `<span class="qx-status-label">Unavailable today</span>`
            : `<span class="qx-chip qx-chip-live"><span class="pulse-dot"></span> On duty</span>`}
        </div>
      </div>`;
    })
    .join("");
}

/* ---------- Event Listeners ---------- */

document.getElementById("modalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "modalBackdrop") closeModal();
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("asSearch").addEventListener("input", renderQueue);
  document.getElementById("dismissFalseAlarmBtn").addEventListener("click", dismissFalseAlarm);
  document.getElementById("confirmEmergencyBtn").addEventListener("click", openConfirmEmergencyModal);
  document.getElementById("walkinBtn").addEventListener("click", openWalkinModal);
  document.getElementById("analyticsToggleBtn").addEventListener("click", toggleAnalytics);

  document.querySelectorAll(".analytics-period").forEach((btn) => {
    btn.addEventListener("click", () => loadAnalytics(btn.dataset.period));
  });

  setupTabs();
  init();
  loadActiveEmergencyAlerts();
});

document.getElementById("confirmedEmergenciesTable").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "emergency-pass") {
    downloadEmergencyPass(btn.dataset.alertId);
  } else if (btn.dataset.action === "admit-emergency") {
    admitEmergencyPatient(btn.dataset.alertId, btn.dataset.patientName);
  }
});

document.getElementById("queueTable").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const tokenId = btn.dataset.token;
  const action = btn.dataset.action;
  if (action === "view") {
    const booking = queue.find((b) => b.tokenId === tokenId);
    if (booking) viewPatient(booking);
  } else if (action === "confirm") {
    setStatus(tokenId, "CONFIRMED");
  } else if (action === "reject") {
    const booking = queue.find((b) => b.tokenId === tokenId);
    if (booking) openRejectModal(booking);
  } else if (action === "reschedule") {
    const booking = queue.find((b) => b.tokenId === tokenId);
    if (booking) openRescheduleModal(booking);
  } else if (action === "qr") {
    const booking = queue.find((b) => b.tokenId === tokenId);
    if (booking) openTokenPass(booking);
  } else if (action === "set-status") {
    setStatus(tokenId, btn.dataset.status);
  }
});

document.getElementById("walkinHistoryList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "walkin-dl-pass") {
    downloadWalkinPassPdf(btn.dataset.tokenId);
  } else if (btn.dataset.action === "walkin-reprint") {
    printWalkinPass(btn);
  }
});

document.getElementById("modalBody").addEventListener("click", (e) => {
  const chip = e.target.closest(".qx-template-chips button[data-index]");
  if (chip) {
    document.querySelectorAll(".qx-template-chips button[data-index]").forEach((b) => b.classList.remove("selected"));
    chip.classList.add("selected");
    const textarea = document.getElementById("rejectMessage") || document.getElementById("reschedMessage");
    if (textarea) textarea.value = chip.textContent.trim();
    return;
  }
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "close") {
    closeModal();
  } else if (btn.dataset.action === "reject-submit") {
    submitReject(btn.dataset.token);
  } else if (btn.dataset.action === "reschedule-submit") {
    submitReschedule(btn.dataset.token);
  } else if (btn.dataset.action === "confirm-emergency-submit") {
    submitConfirmEmergency();
  } else if (btn.dataset.action === "walkin-submit") {
    submitWalkinToken();
  } else if (btn.dataset.action === "walkin-print") {
    printWalkinPass(btn);
  } else if (btn.dataset.action === "walkin-download") {
    downloadWalkinPassPdf(btn.dataset.tokenId);
  }
});
