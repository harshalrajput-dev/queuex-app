let myBookings = [];
let departments = [];
let doctorsForDept = [];
let selectedDoctorId = null;
let selectedSlot = null;
const seenApproaching = new Set();
let sosCountdownTimer = null;
let sosCountdownValue = 0;
let triageLocation = { lat: null, lng: null };
let triageAddressResolved = "";
let familyMembers = [];

async function init() {
  const user = requireAuth(["PATIENT"]);
  if (!user) return;

  document.getElementById("navName").textContent = user.name;
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profileEmail").textContent = user.email;
  document.getElementById("profileMobile").textContent = user.mobile;
  document.getElementById("profileBlood").textContent = user.bloodGroup || "-";
  document.getElementById("profileAge").textContent = ageFromDob(user.dob) || "-";
  document.getElementById("profileCity").textContent = user.city || "-";
  if (user.profilePhoto) {
    document.getElementById("profilePhoto").src = user.profilePhoto;
    document.getElementById("navAvatar").src = user.profilePhoto;
  } else {
    document.getElementById("profilePhoto").textContent = user.name.charAt(0).toUpperCase();
    document.getElementById("navAvatar").textContent = user.name.charAt(0).toUpperCase();
  }

  const today = new Date().toISOString().split("T")[0];
  const dateInput = document.getElementById("bkDate");
  dateInput.min = today;
  dateInput.value = today;

  await Promise.all([loadDepartments(), loadTokens(), loadNotifications(), loadMedicalHistory(), loadEmergencyPass(), checkSosCooldown(), loadFamilyMembers()]);
  setInterval(refreshLoop, 5000);
  startPatientRealtime();
}

async function refreshLoop() {
  const before = new Map(myBookings.map((b) => [b.tokenId, b.status]));
  await loadTokens();
  for (const b of myBookings) {
    const prev = before.get(b.tokenId);
    if (prev && prev !== b.status) {
      if (b.status === "CONFIRMED") {
        toast(`🎉 Your token ${b.tokenId} is confirmed! You can now download your token pass.`);
      } else {
        toast(`Your token ${b.tokenId} status updated to ${b.status.replace(/_/g, " ")}.`);
      }
    }
  }
  await loadNotifications();
  await loadEmergencyPass();
}

function startPatientRealtime() {
  if (!window.EventSource) return;
  const es = new EventSource(`${API_BASE}/queue-display/events`);
  es.addEventListener("emergency.confirmed", (e) => {
    try {
      const data = JSON.parse(e.data);
      const user = getUser();
      if (user && data.patientEmail === user.email) {
        renderEmergencyPass({
          alertId: data.alertId,
          tokenId: data.tokenId,
          roomNumber: data.roomNumber,
          ambulanceNumber: data.ambulanceNumber,
          instructions: data.instructions,
          confirmedAt: data.confirmedAt,
          severity: data.severity,
          severityLabel: data.severityLabel,
          customAddress: data.customAddress,
          distanceKm: data.distanceKm,
          estimatedTravelMinutes: data.estimatedTravelMinutes
        });
        stopEmergencyPolling();
        toast(`🚨 Your emergency has been confirmed! Assigned to Room ${data.roomNumber || "?"}. Download your pass.`);
      }
    } catch (err) { /* silent */ }
  });
  es.addEventListener("emergency.dismissed", () => { /* silent */ });
  es.onerror = () => { /* EventSource reconnects automatically */ };
}

async function loadDepartments() {
  try {
    const res = await api("/departments");
    departments = res.data || [];
    document.getElementById("bkDepartment").innerHTML =
      `<option value="">Select department</option>` +
      departments.map((d) => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join("");
  } catch (err) {
    handleError(err, "bookError");
  }
}

async function loadDoctors() {
  const dept = document.getElementById("bkDepartment").value;
  selectedDoctorId = null;
  selectedSlot = null;
  const box = document.getElementById("doctorPicker");
  if (!dept) { box.innerHTML = ""; return; }
  try {
    const res = await api(`/doctors?department=${encodeURIComponent(dept)}`);
    doctorsForDept = res.data || [];
    box.innerHTML = doctorsForDept.length
      ? doctorsForDept.map((doc) => {
          const unavailable = doc.status && doc.status !== "AVAILABLE";
          return `
            <div class="qx-card" id="doc-${doc._id}">
              <div class="qx-doc-top">
                <div class="qx-doc-avatar qx-doc-avatar-sm ${unavailable ? "off" : ""}">
                  ${doctorAvatar(doc)}
                </div>
                <div>
                  <strong>${escapeHtml(doc.name)}</strong>
                  <div class="qx-muted">${escapeHtml(doc.qualification || "")}</div>
                  <div class="qx-muted">Room: ${escapeHtml(doc.room || "-")}</div>
                </div>
              </div>
              <div class="qx-mt">
                ${(doc.opdSlots || []).map((slot) => `
                  <button type="button" class="qx-btn qx-btn-outline qx-btn-sm qx-mb" style="margin-right:6px;"
                    ${unavailable ? "disabled" : ""}
                    data-doc="${escapeHtml(doc._id)}" data-slot="${escapeHtml(slot)}">${escapeHtml(slot)}</button>
                `).join("")}
              </div>
              ${unavailable ? `<div class="qx-badge rejected qx-mt">${escapeHtml(doc.status.replace(/_/g, " "))}</div>` : ""}
            </div>`;
        }).join("")
      : `<div class="qx-alert qx-alert-info">No doctors in this department.</div>`;
  } catch (err) {
    box.innerHTML = `<div class="qx-alert qx-alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

function selectSlot(docId, slot, btn) {
  selectedDoctorId = docId;
  selectedSlot = slot;
  document.querySelectorAll("#doctorPicker .qx-card").forEach((c) => c.style.borderColor = "var(--qx-border)");
  const card = document.getElementById(`doc-${docId}`);
  if (card) card.style.borderColor = "var(--qx-blue)";
  document.querySelectorAll("#doctorPicker .qx-btn-outline").forEach((b) => b.classList.remove("qx-btn-outline"));
  btn.classList.add("qx-btn-outline");
  btn.style.background = "var(--qx-blue)";
  btn.style.color = "#fff";
}

function updateDistancePreview() {
  const val = document.getElementById("bkAddress").value.trim();
  const el = document.getElementById("distancePreview");
  if (!val) { el.innerHTML = ""; hideRouteEstimator(); return; }
  el.innerHTML = `<span class="qx-badge confirmed">📏 ${estimateDistanceKm(val)} km from New Civil Hospital, Surat</span>`;
  showRouteEstimator(val);
}

function fetchCurrentLocation() {
  const btn = document.getElementById("gpsBtn");
  const spinner = document.getElementById("gpsSpinner");
  if (!navigator.geolocation) {
    toast("Geolocation is not supported by your browser.");
    return;
  }
  btn.disabled = true;
  spinner.classList.remove("qx-hide");
  btn.querySelector(".gps-icon").textContent = "⏳";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const areaName = reverseGeocodeToLocality(latitude, longitude);
      const addressInput = document.getElementById("bkAddress");
      addressInput.value = areaName + ", Surat";
      addressInput.dispatchEvent(new Event("input"));
      btn.disabled = false;
      spinner.classList.add("qx-hide");
      btn.querySelector(".gps-icon").textContent = "📍";
      toast(`Location detected: ${areaName}, Surat`);
    },
    (err) => {
      btn.disabled = false;
      spinner.classList.add("qx-hide");
      btn.querySelector(".gps-icon").textContent = "📍";
      if (err.code === 1) {
        toast("Location access denied. Please allow location permissions.");
      } else {
        toast("Unable to get location. Please enter address manually.");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function showRouteEstimator(addressText) {
  const container = document.getElementById("routeEstimator");
  const cardsBox = document.getElementById("routeCards");
  if (!addressText) { hideRouteEstimator(); return; }

  const routes = generateRoutesFromAddress(addressText);
  container.classList.remove("qx-hide");

  cardsBox.innerHTML = `
    <div class="qx-route-table-wrap">
      <table class="qx-route-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Distance</th>
            <th>Traffic</th>
            <th>Est. Bike Time</th>
          </tr>
        </thead>
        <tbody>
          ${routes.map((r) => `
            <tr class="${r.best ? "qx-route-best" : ""}">
              <td>
                <div class="qx-route-name">
                  <span class="qx-route-icon">${r.icon}</span>
                  <div>
                    <strong>${escapeHtml(r.name)}</strong>
                    <div class="qx-route-via">${escapeHtml(r.via)}</div>
                  </div>
                </div>
              </td>
              <td><span class="qx-route-dist">${r.distance} km</span></td>
              <td><span class="qx-traffic-badge ${r.trafficCss}">${r.trafficEmoji} ${r.trafficLabel}</span></td>
              <td>
                <span class="qx-route-time">${r.minutes} min</span>
                ${r.best ? `<span class="qx-badge qx-badge-best">⭐ Best Route</span>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

function hideRouteEstimator() {
  const container = document.getElementById("routeEstimator");
  if (container) container.classList.add("qx-hide");
}

/* ---------- Family Members ---------- */

async function loadFamilyMembers() {
  try {
    const res = await api("/auth/family-members", { auth: true });
    familyMembers = res.data || [];
    renderFamilyMembers();
    populateBookingForDropdown();
    populateTriageForDropdown();
  } catch (err) {
    familyMembers = [];
  }
}

function renderFamilyMembers() {
  const box = document.getElementById("familyMembersList");
  if (!familyMembers.length) {
    box.innerHTML = `<div class="qx-muted" style="font-size:13px;">No family members added yet.</div>`;
    return;
  }
  const relationEmojis = { Father: "👨", Mother: "👩", Spouse: "💑", Son: "👦", Daughter: "👧", Brother: "🧑", Sister: "👧", Grandfather: "👴", Grandmother: "👵", Other: "👤" };
  box.innerHTML = familyMembers.map((fm) => `
    <div class="qx-family-member-row" id="fm-${fm._id}">
      <div class="qx-family-member-info">
        <span class="qx-family-member-avatar">${relationEmojis[fm.relation] || "👤"}</span>
        <div>
          <div style="font-weight:600;font-size:14px;">${escapeHtml(fm.name)}</div>
          <div class="qx-muted" style="font-size:12px;">${escapeHtml(fm.relation)} · ${fm.age} yrs · ${escapeHtml(fm.gender)}</div>
        </div>
      </div>
      <div class="qx-family-member-actions">
        <button class="qx-btn qx-btn-outline qx-btn-sm" data-fm-action="edit" data-fm-id="${fm._id}">Edit</button>
        <button class="qx-btn qx-btn-danger qx-btn-sm" data-fm-action="delete" data-fm-id="${fm._id}">Delete</button>
      </div>
    </div>
  `).join("");
}

function populateBookingForDropdown() {
  const sel = document.getElementById("bkBookingFor");
  sel.innerHTML = `<option value="self">Self (${escapeHtml(document.getElementById("profileName").textContent)})</option>` +
    familyMembers.map((fm) => `<option value="${fm._id}">${escapeHtml(fm.name)} (${escapeHtml(fm.relation)})</option>`).join("");
}

function populateTriageForDropdown() {
  const sel = document.getElementById("triageBookingFor");
  if (!sel) return;
  sel.innerHTML = `<option value="self">Self</option>` +
    familyMembers.map((fm) => `<option value="${fm._id}">${escapeHtml(fm.name)} (${escapeHtml(fm.relation)})</option>`).join("");
}

function openAddFamilyMemberModal() {
  openModal(`
    <h3 style="margin:0 0 16px;">Add Family Member</h3>
    <div class="qx-grid qx-grid-2">
      <div class="qx-field"><label>Name *</label><input type="text" id="fmName" placeholder="Full name"></div>
      <div class="qx-field"><label>Age *</label><input type="number" id="fmAge" min="0" max="120" placeholder="Age"></div>
      <div class="qx-field"><label>Relation *</label>
        <select id="fmRelation">
          <option value="Father">Father</option><option value="Mother">Mother</option>
          <option value="Spouse">Spouse</option><option value="Son">Son</option>
          <option value="Daughter">Daughter</option><option value="Brother">Brother</option>
          <option value="Sister">Sister</option><option value="Grandfather">Grandfather</option>
          <option value="Grandmother">Grandmother</option><option value="Other">Other</option>
        </select>
      </div>
      <div class="qx-field"><label>Gender *</label>
        <select id="fmGender"><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select>
      </div>
    </div>
    <div id="fmFormError" class="qx-alert qx-alert-danger qx-mt qx-hide"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="qx-btn qx-btn-outline qx-btn-sm" id="fmCancelBtn">Cancel</button>
      <button class="qx-btn qx-btn-sm" id="fmSaveBtn" style="background:var(--qx-blue);color:#fff;">Add Family Member</button>
    </div>
  `);
  document.getElementById("fmCancelBtn").addEventListener("click", closeModal);
  document.getElementById("fmSaveBtn").addEventListener("click", saveNewFamilyMember);
}

async function saveNewFamilyMember() {
  const errBox = document.getElementById("fmFormError");
  const name = document.getElementById("fmName").value.trim();
  const age = document.getElementById("fmAge").value;
  const relation = document.getElementById("fmRelation").value;
  const gender = document.getElementById("fmGender").value;
  if (!name || age === "") { errBox.textContent = "Name and age are required."; errBox.classList.remove("qx-hide"); return; }
  try {
    await api("/auth/family-members", { method: "POST", auth: true, body: { name, age: Number(age), relation, gender } });
    closeModal();
    toast("Family member added.");
    await loadFamilyMembers();
  } catch (err) { errBox.textContent = err.message; errBox.classList.remove("qx-hide"); }
}

function openEditFamilyMemberModal(fmId) {
  const fm = familyMembers.find((f) => f._id === fmId);
  if (!fm) return;
  openModal(`
    <h3 style="margin:0 0 16px;">Edit Family Member</h3>
    <div class="qx-grid qx-grid-2">
      <div class="qx-field"><label>Name *</label><input type="text" id="fmName" value="${escapeHtml(fm.name)}"></div>
      <div class="qx-field"><label>Age *</label><input type="number" id="fmAge" min="0" max="120" value="${fm.age}"></div>
      <div class="qx-field"><label>Relation *</label>
        <select id="fmRelation">
          ${["Father","Mother","Spouse","Son","Daughter","Brother","Sister","Grandfather","Grandmother","Other"]
            .map((r) => `<option value="${r}" ${fm.relation===r?"selected":""}>${r}</option>`).join("")}
        </select>
      </div>
      <div class="qx-field"><label>Gender *</label>
        <select id="fmGender">
          ${["Male","Female","Other"].map((g) => `<option value="${g}" ${fm.gender===g?"selected":""}>${g}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="fmFormError" class="qx-alert qx-alert-danger qx-mt qx-hide"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="qx-btn qx-btn-outline qx-btn-sm" id="fmCancelBtn">Cancel</button>
      <button class="qx-btn qx-btn-sm" id="fmSaveBtn" style="background:var(--qx-blue);color:#fff;">Save Changes</button>
    </div>
  `);
  document.getElementById("fmCancelBtn").addEventListener("click", closeModal);
  document.getElementById("fmSaveBtn").addEventListener("click", async () => {
    const errBox = document.getElementById("fmFormError");
    const name = document.getElementById("fmName").value.trim();
    const age = document.getElementById("fmAge").value;
    const relation = document.getElementById("fmRelation").value;
    const gender = document.getElementById("fmGender").value;
    if (!name || age === "") { errBox.textContent = "Name and age are required."; errBox.classList.remove("qx-hide"); return; }
    try {
      await api(`/auth/family-members/${fmId}`, { method: "PUT", auth: true, body: { name, age: Number(age), relation, gender } });
      closeModal();
      toast("Family member updated.");
      await loadFamilyMembers();
    } catch (err) { errBox.textContent = err.message; errBox.classList.remove("qx-hide"); }
  });
}

async function deleteFamilyMember(fmId) {
  const fm = familyMembers.find((f) => f._id === fmId);
  if (!fm) return;
  if (!confirm(`Remove ${fm.name} from your family members?`)) return;
  try {
    await api(`/auth/family-members/${fmId}`, { method: "DELETE", auth: true });
    toast("Family member removed.");
    await loadFamilyMembers();
  } catch (err) { toast(err.message); }
}

document.getElementById("familyMembersList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fm-action]");
  if (!btn) return;
  if (btn.dataset.fmAction === "edit") openEditFamilyMemberModal(btn.dataset.fmId);
  else if (btn.dataset.fmAction === "delete") deleteFamilyMember(btn.dataset.fmId);
});

document.getElementById("addFamilyMemberBtn").addEventListener("click", openAddFamilyMemberModal);

/* ---------- Emergency SOS Cooldown ---------- */

async function checkSosCooldown() {
  try {
    const user = getUser();
    if (!user) return;
    const res = await api(`/emergency/cooldown?email=${encodeURIComponent(user.email)}`, { auth: true });
    const data = res.data || res;
    if (data.onCooldown) {
      disableSosButton(data.coolDownUntil, data.remainingMs);
    } else {
      enableSosButton();
    }
  } catch (err) {
    enableSosButton();
  }
}

function disableSosButton(coolDownUntil, remainingMs) {
  const btn = document.getElementById("sosBtn");
  const info = document.getElementById("sosCooldownInfo");
  btn.classList.add("disabled");
  btn.disabled = true;
  const days = Math.ceil((remainingMs || 0) / (1000 * 60 * 60 * 24));
  const unlockDate = new Date(coolDownUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  info.textContent = `🔒 Emergency SOS locked for ${days} more day(s). Unlocks on ${unlockDate}.`;
  info.classList.remove("qx-hide");
}

function enableSosButton() {
  const btn = document.getElementById("sosBtn");
  const info = document.getElementById("sosCooldownInfo");
  btn.classList.remove("disabled");
  btn.disabled = false;
  info.classList.add("qx-hide");
}

/* ---------- Emergency SOS ---------- */

function playSosBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1100, ctx.currentTime);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.3);
    }, 150);
  } catch (e) { /* silent */ }
}

function openSosModal() {
  triageLocation = { lat: null, lng: null };
  triageAddressResolved = "";

  const backdrop = document.getElementById("sosBackdrop");
  const title = document.getElementById("sosModalTitle");
  const body = document.getElementById("sosModalBody");
  const actions = document.getElementById("sosModalActions");

  title.textContent = "Emergency Triage";
  body.innerHTML = `
    <div class="qx-triage-form">
      <div class="qx-triage-section">
        <div class="qx-triage-section-title">Emergency For</div>
        <div class="qx-field" style="margin-bottom:12px;">
          <select id="triageBookingFor"><option value="self">Self</option></select>
        </div>
      </div>
      <div class="qx-triage-section">
        <div class="qx-triage-section-title">Severity Level *</div>
        <div class="qx-triage-severity-options" id="triageSeverityOptions">
          <label class="qx-triage-severity-option severity-moderate" data-severity="MODERATE">
            <input type="radio" name="triageSeverity" value="MODERATE" checked>
            <div>
              <div class="qx-triage-severity-label">Moderate / Stable</div>
              <div class="qx-triage-severity-desc">Non-life-threatening, needs prompt attention</div>
            </div>
          </label>
          <label class="qx-triage-severity-option severity-serious" data-severity="SERIOUS">
            <input type="radio" name="triageSeverity" value="SERIOUS">
            <div>
              <div class="qx-triage-severity-label">Serious / Urgent</div>
              <div class="qx-triage-severity-desc">Significant risk, requires urgent care</div>
            </div>
          </label>
          <label class="qx-triage-severity-option severity-critical" data-severity="CRITICAL">
            <input type="radio" name="triageSeverity" value="CRITICAL">
            <div>
              <div class="qx-triage-severity-label">Critical / Severe</div>
              <div class="qx-triage-severity-desc">Life-threatening, immediate intervention needed</div>
            </div>
          </label>
        </div>
      </div>
      <div class="qx-triage-section">
        <div class="qx-triage-section-title">Your Location</div>
        <div class="qx-triage-location-row">
          <input type="text" id="triageAddress" placeholder="Custom address / location (optional)">
          <button type="button" class="qx-triage-gps-btn" id="triageGpsBtn">
            <span id="triageGpsIcon">📍</span> GPS
          </button>
        </div>
        <div class="qx-triage-gps-status qx-hide" id="triageGpsStatus"></div>
        <div class="qx-triage-preview qx-hide" id="triagePreview"></div>
      </div>
      <p style="font-size:11px;color:#64748b;margin:8px 0 0;">Hospital staff will be immediately alerted with your location and severity.</p>
    </div>`;
  actions.innerHTML = `
    <button class="qx-btn qx-btn-outline qx-btn-sm" id="sosCancelBtn">Cancel</button>
    <button class="qx-btn qx-btn-danger qx-btn-sm" id="sosConfirmBtn">🚨 Send Emergency SOS</button>`;

  backdrop.classList.remove("qx-hide");
  document.getElementById("sosCancelBtn").addEventListener("click", closeSosModal);
  document.getElementById("sosConfirmBtn").addEventListener("click", startSosCountdown);
  document.getElementById("triageGpsBtn").addEventListener("click", fetchTriageLocation);
  document.getElementById("triageAddress").addEventListener("input", updateTriagePreview);
  populateTriageForDropdown();

  document.querySelectorAll('input[name="triageSeverity"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(".qx-triage-severity-option").forEach((opt) => opt.classList.remove("selected"));
      const selected = document.querySelector(`input[name="triageSeverity"]:checked`);
      if (selected) selected.closest(".qx-triage-severity-option").classList.add("selected");
    });
  });
  const firstOpt = document.querySelector('.qx-triage-severity-option[data-severity="MODERATE"]');
  if (firstOpt) firstOpt.classList.add("selected");
}

function closeSosModal() {
  clearInterval(sosCountdownTimer);
  sosCountdownTimer = null;
  sosCountdownValue = 0;
  document.getElementById("sosBackdrop").classList.add("qx-hide");
}

function fetchTriageLocation() {
  const btn = document.getElementById("triageGpsBtn");
  const icon = document.getElementById("triageGpsIcon");
  const status = document.getElementById("triageGpsStatus");

  if (!navigator.geolocation) {
    status.textContent = "Geolocation not supported by your browser.";
    status.className = "qx-triage-gps-status error";
    status.classList.remove("qx-hide");
    return;
  }

  btn.disabled = true;
  icon.textContent = "⏳";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      triageLocation = { lat: latitude, lng: longitude };
      const areaName = reverseGeocodeToLocality(latitude, longitude);
      triageAddressResolved = areaName + ", Surat";

      const addrInput = document.getElementById("triageAddress");
      if (!addrInput.value.trim()) {
        addrInput.value = triageAddressResolved;
      }

      const dist = estimateDistanceKm(addrInput.value.trim() || triageAddressResolved);
      status.innerHTML = `✅ GPS locked: <strong>${escapeHtml(triageAddressResolved)}</strong>`;
      status.className = "qx-triage-gps-status success";
      status.classList.remove("qx-hide");

      updateTriagePreview();
      btn.disabled = false;
      icon.textContent = "📍";
      toast(`Location detected: ${areaName}, Surat`);
    },
    (err) => {
      btn.disabled = false;
      icon.textContent = "📍";
      if (err.code === 1) {
        status.textContent = "Location access denied. Please enter address manually.";
      } else {
        status.textContent = "Unable to get GPS. Enter address manually.";
      }
      status.className = "qx-triage-gps-status error";
      status.classList.remove("qx-hide");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function updateTriagePreview() {
  const addrInput = document.getElementById("triageAddress");
  const preview = document.getElementById("triagePreview");
  const addr = (addrInput && addrInput.value.trim()) || "";

  if (!addr && !triageLocation.lat) {
    preview.classList.add("qx-hide");
    return;
  }

  const dist = estimateDistanceKm(addr || triageAddressResolved);
  const etaMin = Math.max(3, Math.round((dist / 25) * 60));
  preview.innerHTML = `
    <span>📏 <strong>${dist} km</strong> from hospital</span>
    <span>⏱ ~<strong>${etaMin} min</strong> travel time</span>`;
  preview.classList.remove("qx-hide");
}

function startSosCountdown() {
  const severity = document.querySelector('input[name="triageSeverity"]:checked');
  if (!severity) {
    toast("Please select a severity level.");
    return;
  }

  const body = document.getElementById("sosModalBody");
  const actions = document.getElementById("sosModalActions");
  sosCountdownValue = 5;

  body.innerHTML = `
    <div class="qx-sos-countdown-wrap">
      <div class="qx-sos-countdown-ring">
        <svg viewBox="0 0 100 100">
          <circle class="qx-sos-ring-bg" cx="50" cy="50" r="44"/>
          <circle class="qx-sos-ring-progress" cx="50" cy="50" r="44" id="sosRingProgress"/>
        </svg>
        <span class="qx-sos-countdown-num" id="sosCountdownNum">5</span>
      </div>
      <p class="qx-sos-countdown-label">Sending SOS in <strong id="sosCountdownText">5 seconds</strong>...</p>
      <p class="qx-sos-countdown-sub">Tap "Cancel" to abort</p>
    </div>`;
  actions.innerHTML = `
    <button class="qx-btn qx-btn-outline qx-btn-sm" id="sosCancelCountdownBtn">Cancel Emergency</button>`;

  document.getElementById("sosCancelCountdownBtn").addEventListener("click", closeSosModal);

  playSosBeep();

  const circumference = 2 * Math.PI * 44;
  const ring = document.getElementById("sosRingProgress");
  if (ring) {
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = "0";
  }

  sosCountdownTimer = setInterval(() => {
    sosCountdownValue--;
    const numEl = document.getElementById("sosCountdownNum");
    const textEl = document.getElementById("sosCountdownText");
    if (numEl) numEl.textContent = sosCountdownValue;
    if (textEl) textEl.textContent = sosCountdownValue + " seconds";
    if (ring) {
      ring.style.strokeDashoffset = circumference * (1 - sosCountdownValue / 5);
    }
    if (sosCountdownValue <= 3 && sosCountdownValue > 0) {
      playSosBeep();
    }
    if (sosCountdownValue <= 0) {
      clearInterval(sosCountdownTimer);
      sosCountdownTimer = null;
      fireSos();
    }
  }, 1000);
}

async function fireSos() {
  const body = document.getElementById("sosModalBody");
  const actions = document.getElementById("sosModalActions");
  const title = document.getElementById("sosModalTitle");

  title.textContent = "🚨 Sending SOS...";
  body.innerHTML = `
    <div class="qx-sos-sending">
      <div class="qx-spinner"></div>
      <p>Alerting hospital staff...</p>
    </div>`;
  actions.innerHTML = "";

  const active = myBookings.find((b) =>
    ["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "PENDING_ASSISTANT"].includes(b.status)
  );

  const severity = document.querySelector('input[name="triageSeverity"]:checked');
  const triageSeverity = severity ? severity.value : "MODERATE";
  const address = document.getElementById("triageAddress") ? document.getElementById("triageAddress").value.trim() : "";

  const payload = {
    tokenId: active ? active.tokenId : "",
    severity: triageSeverity,
    customAddress: address
  };
  if (triageLocation.lat != null) {
    payload.latitude = triageLocation.lat;
    payload.longitude = triageLocation.lng;
  }
  const triageBookingForVal = document.getElementById("triageBookingFor");
  if (triageBookingForVal && triageBookingForVal.value !== "self") {
    const fm = familyMembers.find((f) => f._id === triageBookingForVal.value);
    if (fm) {
      payload.alertFor = fm._id;
      payload.familyMemberId = fm._id;
      payload.patientName = `${getUser().name} → ${fm.name}`;
    }
  }

  try {
    const res = await api("/emergency/trigger", {
      method: "POST",
      auth: true,
      body: payload
    });
    title.textContent = "✅ SOS Sent";
    body.innerHTML = `
      <div class="qx-sos-sent">
        <div class="qx-sos-sent-icon">✅</div>
        <p><strong>Emergency alert sent successfully.</strong></p>
        <p class="qx-muted">Hospital staff has been notified. Please stay where you are if possible.</p>
        <div style="margin-top:12px;text-align:left;">
          <div style="font-size:12px;color:#475569;margin-bottom:4px;"><strong>Severity:</strong> ${escapeHtml(res.severityLabel || triageSeverity)}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:4px;"><strong>Distance:</strong> ${res.distanceKm != null ? res.distanceKm + " km" : "Calculating..."}</div>
          <div style="font-size:12px;color:#475569;"><strong>Est. Travel:</strong> ${res.estimatedTravelMinutes != null ? "~" + res.estimatedTravelMinutes + " min" : "Calculating..."}</div>
        </div>
        <p class="qx-muted" style="font-size:12px;margin-top:8px;">${escapeHtml(res.message || "")}</p>
      </div>`;
    actions.innerHTML = `
      <button class="qx-btn qx-btn-outline qx-btn-sm" id="sosCloseBtn">Close</button>`;
    document.getElementById("sosCloseBtn").addEventListener("click", closeSosModal);
    toast("🚨 Emergency SOS sent. Hospital staff notified.");
    startEmergencyPolling();
  } catch (err) {
    title.textContent = "❌ Failed to Send";
    body.innerHTML = `
      <div class="qx-sos-error">
        <p><strong>Could not send emergency alert.</strong></p>
        <p class="qx-muted">${escapeHtml(err.message)}</p>
        <p class="qx-muted" style="margin-top:10px;font-size:13px;">Please call the hospital emergency line directly: <strong>0261-XXXXXXX</strong></p>
      </div>`;
    actions.innerHTML = `
      <button class="qx-btn qx-btn-outline qx-btn-sm" id="sosRetryBtn">Retry</button>
      <button class="qx-btn qx-btn-outline qx-btn-sm" id="sosCloseBtn">Close</button>`;
    document.getElementById("sosRetryBtn").addEventListener("click", () => { closeSosModal(); openSosModal(); });
    document.getElementById("sosCloseBtn").addEventListener("click", closeSosModal);
  }
}

/* ---------- Emergency Pass ---------- */

let emergencyPollingTimer = null;

async function loadEmergencyPass() {
  try {
    const user = getUser();
    if (!user) return;
    const res = await api(`/emergency/check?email=${encodeURIComponent(user.email)}`, { auth: true });
    if (res.data && res.data.confirmedAlert) {
      renderEmergencyPass(res.data.confirmedAlert);
      stopEmergencyPolling();
    } else if (res.data && res.data.hasActive) {
      startEmergencyPolling();
    }
  } catch (err) { /* silent */ }
}

function renderEmergencyPass(alert) {
  const card = document.getElementById("emergencyPassCard");
  const content = document.getElementById("emergencyPassContent");
  card.classList.remove("qx-hide");
  const time = alert.confirmedAt ? new Date(alert.confirmedAt).toLocaleString("en-IN") : new Date().toLocaleString("en-IN");

  const severityClass = (alert.severity || "MODERATE").toLowerCase();
  const severityLabel = alert.severityLabel || (alert.severity || "MODERATE").replace(/_/g, " ");

  content.innerHTML = `
    <div class="qx-emergency-pass-details">
      <div class="qx-emergency-pass-row">
        <div class="qx-emergency-pass-field">
          <span>Token</span>
          <strong>${escapeHtml(alert.tokenId || "N/A")}</strong>
        </div>
        <div class="qx-emergency-pass-field">
          <span>Room</span>
          <strong>Room ${escapeHtml(alert.roomNumber || "-")}</strong>
        </div>
      </div>
      <div class="qx-emergency-pass-row">
        <div class="qx-emergency-pass-field">
          <span>Severity</span>
          <strong><span class="qx-severity-badge ${severityClass}">${escapeHtml(severityLabel)}</span></strong>
        </div>
        <div class="qx-emergency-pass-field">
          <span>Confirmed At</span>
          <strong>${escapeHtml(time)}</strong>
        </div>
      </div>
      ${alert.customAddress ? `
      <div class="qx-emergency-pass-row">
        <div class="qx-emergency-pass-field" style="grid-column:1/-1;">
          <span>Patient Address</span>
          <strong>${escapeHtml(alert.customAddress)}</strong>
        </div>
      </div>` : ""}
      <div class="qx-emergency-pass-row">
        ${alert.distanceKm != null ? `
        <div class="qx-emergency-pass-field">
          <span>Distance</span>
          <strong>${escapeHtml(String(alert.distanceKm))} km</strong>
        </div>` : ""}
        ${alert.estimatedTravelMinutes != null ? `
        <div class="qx-emergency-pass-field">
          <span>Est. Travel Time</span>
          <strong>~${escapeHtml(String(alert.estimatedTravelMinutes))} min</strong>
        </div>` : ""}
      </div>
      ${alert.ambulanceNumber ? `
      <div class="qx-emergency-pass-row">
        <div class="qx-emergency-pass-field">
          <span>Ambulance</span>
          <strong>${escapeHtml(alert.ambulanceNumber)}</strong>
        </div>
      </div>` : ""}
      ${alert.instructions ? `
      <div class="qx-emergency-pass-instructions">
        <span>Instructions</span>
        <strong>${escapeHtml(alert.instructions)}</strong>
      </div>` : ""}
    </div>
    <div class="qx-emergency-pass-actions">
      <button class="qx-btn qx-btn-success qx-btn-sm w100" id="downloadEmergencyPassBtn" data-alert-id="${escapeHtml(alert.alertId)}">⬇ Download Emergency Pass (PDF)</button>
      <div class="qx-emergency-pass-note">Show this pass at <strong>Room ${escapeHtml(alert.roomNumber || "...")}</strong> to begin treatment immediately.</div>
    </div>`;

  document.getElementById("downloadEmergencyPassBtn").addEventListener("click", (e) => {
    const alertId = e.currentTarget.dataset.alertId;
    if (alertId) downloadEmergencyPassPdf(alertId);
  });
}

function downloadEmergencyPassPdf(alertId) {
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

function startEmergencyPolling() {
  stopEmergencyPolling();
  emergencyPollingTimer = setInterval(loadEmergencyPass, 3000);
}

function stopEmergencyPolling() {
  if (emergencyPollingTimer) {
    clearInterval(emergencyPollingTimer);
    emergencyPollingTimer = null;
  }
}

async function submitBooking() {
  const box = document.getElementById("bookError");
  box.classList.add("qx-hide");
  if (!selectedDoctorId || !selectedSlot) {
    box.textContent = "Please select a doctor and time slot.";
    box.classList.remove("qx-hide");
    return;
  }
  const doc = doctorsForDept.find((d) => d._id === selectedDoctorId);
  try {
    const bookingForVal = document.getElementById("bkBookingFor").value;
    const payload = {
      doctorId: doc._id,
      doctorName: doc.name,
      doctorDept: doc.department,
      slotTime: selectedSlot,
      bookingDate: document.getElementById("bkDate").value,
      address: document.getElementById("bkAddress").value.trim(),
      symptoms: {
        primary: document.getElementById("bkSymptom").value.trim(),
        severity: document.getElementById("bkSeverity").value,
        duration: document.getElementById("bkDuration").value
      }
    };
    if (bookingForVal && bookingForVal !== "self") {
      const fm = familyMembers.find((f) => f._id === bookingForVal);
      if (fm) {
        payload.bookingFor = fm._id;
        payload.familyMemberId = fm._id;
        payload.patientName = `${getUser().name} → ${fm.name}`;
      }
    }
    const res = await api("/bookings", {
      method: "POST",
      auth: true,
      body: payload
    });
    toast(`Token ${res.tokenId} booked. Waiting for hospital confirmation.`);
    await Promise.all([loadTokens(), loadNotifications()]);
    resetBookingSelection();
  } catch (err) {
    box.textContent = err.message;
    box.classList.remove("qx-hide");
  }
}

function resetBookingSelection() {
  selectedDoctorId = null;
  selectedSlot = null;
  document.querySelectorAll("#doctorPicker .qx-card").forEach((c) => c.style.borderColor = "var(--qx-border)");
  document.querySelectorAll("#doctorPicker .qx-btn").forEach((b) => {
    b.style.background = "";
    b.style.color = "";
  });
  document.getElementById("bkSymptom").value = "";
}

async function loadTokens() {
  try {
    const res = await api("/bookings?mine=1&limit=50", { auth: true });
    myBookings = Array.isArray(res) ? res : [];
    renderTokens();
    renderCurrentToken();
  } catch (err) {
    document.getElementById("tokensTable").innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderCurrentToken() {
  const activeStatuses = ["PENDING_ASSISTANT", "CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT"];
  const active = myBookings.filter((b) => activeStatuses.includes(b.status))[0];
  const box = document.getElementById("currentTokenBox");
  if (!active) {
    box.innerHTML = `<div class="qx-muted">No active token. Book a token from the form below.</div>`;
    return;
  }
  const hint = {
    PENDING_ASSISTANT: "Waiting for hospital confirmation.",
    CONFIRMED: "Token confirmed. Your appointment pass with QR code is ready to download.",
    PATIENT_ARRIVED: "You have arrived. Please wait for your turn.",
    IN_TREATMENT: "Treatment in progress."
  }[active.status];
  const canDownload = ["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "COMPLETED"].includes(active.status);
  box.innerHTML = `
    <div class="qx-flex qx-wrap qx-mt" style="justify-content:space-between;">
      <div>
        <div style="font-size:32px;font-weight:800;color:var(--qx-blue-dark);">${escapeHtml(active.tokenId)}</div>
        ${statusBadge(active.status)}
        <div class="qx-muted">${escapeHtml(hint)}</div>
      </div>
      <div style="text-align:right;">
        <div><strong>${escapeHtml(active.doctorName)}</strong></div>
        <div class="qx-muted">${escapeHtml(active.doctorDept || "")}</div>
        <div class="qx-muted">${escapeHtml(active.bookingDate)} · ${escapeHtml(active.slotTime)}</div>
        <div class="qx-muted">Room: ${escapeHtml(active.roomNo || "-")}</div>
      </div>
    </div>
    ${active.address ? `
      <div class="qx-flex qx-wrap qx-mt">
        <span class="qx-muted">📍 ${escapeHtml(active.address)}</span>
        <span class="qx-badge confirmed">${formatDistance(active.distanceKm)} from hospital</span>
      </div>` : ""}
    <div class="qx-flex qx-wrap qx-mt">
      ${["CONFIRMED", "PATIENT_ARRIVED", "PENDING_ASSISTANT"].includes(active.status) &&
        typeof active.tokensAhead === "number" && active.tokensAhead >= 0
        ? `<span class="qx-badge neutral">⏱ Est. wait ~${active.estimatedWaitMinutes} min</span>
           <span class="qx-badge arrived">${active.tokensAhead} ${active.tokensAhead === 1 ? "token" : "tokens"} ahead</span>`
        : ""}
      ${active.status === "IN_TREATMENT" ? `<span class="qx-badge confirmed">In treatment now</span>` : ""}
    </div>
    <div class="qx-flex qx-wrap qx-mt">
      ${canDownload
        ? `<button class="qx-btn qx-btn-success qx-btn-sm" data-action="pass" data-token="${escapeHtml(active.tokenId)}">⬇ Download Token</button>`
        : ""}
      <button class="qx-btn qx-btn-danger qx-btn-sm" data-action="cancel" data-token="${escapeHtml(active.tokenId)}">Cancel this token</button>
    </div>`;
}

async function cancelToken(tokenId) {
  if (!confirm("Cancel this token?")) return;
  const reason = prompt("Reason for cancellation (optional):", "") || "";
  try {
    await api(`/bookings/${tokenId}`, {
      method: "PUT",
      auth: true,
      body: { status: "CANCELLED", reason }
    });
    toast("Token cancelled.");
    await Promise.all([loadTokens(), loadNotifications()]);
  } catch (err) {
    toast(err.message);
  }
}

function renderTokens() {
  const tbody = document.getElementById("tokensTable");
  if (!myBookings.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="qx-muted qx-center">No tokens booked yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = myBookings
    .map((b) => `
      <tr>
        <td><strong>${escapeHtml(b.tokenId)}</strong></td>
        <td>${escapeHtml(b.doctorName)}<br><span class="qx-muted">${escapeHtml(b.doctorDept || "")}</span></td>
        <td>${escapeHtml(b.bookingDate)}<br><span class="qx-muted">${escapeHtml(b.slotTime)}</span></td>
        <td>${b.address ? `<span class="qx-badge confirmed">${formatDistance(b.distanceKm)}</span>` : `<span class="qx-muted">-</span>`}</td>
        <td>${statusBadge(b.status)}${b.status === "REJECTED" && b.rejectionReason
          ? `<div class="qx-muted" style="margin-top:4px;">${escapeHtml(b.rejectionReason)}</div>` : ""}</td>
        <td>
          ${["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "COMPLETED"].includes(b.status)
            ? `<button class="qx-btn qx-btn-success qx-btn-sm" data-action="pass" data-token="${escapeHtml(b.tokenId)}">⬇ Download Token</button>`
            : ""}
          ${["PENDING_ASSISTANT", "CONFIRMED"].includes(b.status)
            ? `<button class="qx-btn qx-btn-outline qx-btn-sm" data-action="cancel" data-token="${escapeHtml(b.tokenId)}">Cancel</button>`
            : ""}
          ${!["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "COMPLETED", "PENDING_ASSISTANT"].includes(b.status)
            ? `<span class="qx-muted">-</span>` : ""}
        </td>
      </tr>`)
    .join("");
}

async function loadNotifications() {
  try {
    const res = await api("/notifications", { auth: true });
    const list = res.data.notifications || [];
    const unread = res.data.unreadCount || 0;
    for (const n of list) {
      if (n.type === "TURN_APPROACHING" && n._id && !seenApproaching.has(n._id)) {
        seenApproaching.add(n._id);
        toast(`🔔 ${n.title}: ${n.message} (Simulated SMS/WhatsApp alert also sent)`);
      }
    }
    const badge = document.getElementById("notifBadge");
    badge.textContent = unread;
    badge.classList.toggle("qx-hide", unread === 0);
    document.getElementById("notifList").innerHTML = list.length
      ? list.map((n) => `
          <div style="padding:8px 0;border-bottom:1px solid var(--qx-border);${n.read ? "opacity:0.7;" : "font-weight:700;"}">
            <div>${escapeHtml(n.title)}</div>
            <div class="qx-muted">${escapeHtml(n.message)}</div>
            <div class="last-updated">${formatDateTime(n.createdAt)}</div>
          </div>`).join("")
      : `<div class="qx-muted">No notifications.</div>`;
  } catch (err) {
    /* silent */
  }
}

function toggleNotifications() {
  document.getElementById("notifPanel").classList.toggle("qx-hide");
}

async function markAllRead() {
  try {
    await api("/notifications/read-all", { method: "PUT", auth: true });
    await loadNotifications();
  } catch (err) {
    toast(err.message);
  }
}

async function loadMedicalHistory() {
  try {
    const res = await api("/auth/me", { auth: true });
    const med = res.data.medicalHistory;
    const box = document.getElementById("medicalHistoryBox");
    if (!med || (!med.currentProblem && !(med.preExistingConditions || []).length)) {
      box.innerHTML = `<div class="qx-muted">No medical history recorded.</div>`;
      return;
    }
    const conditions = (med.preExistingConditions || []).join(", ");
    box.innerHTML = `
      <div class="qx-grid qx-grid-2">
        <div><strong>Blood Pressure:</strong> ${escapeHtml(med.bloodPressure || "Normal")}</div>
        <div><strong>Allergies:</strong> ${escapeHtml(med.allergies || "No")}</div>
        <div><strong>Past Surgeries:</strong> ${escapeHtml(med.pastSurgeries || "No")}</div>
        <div><strong>Existing Conditions:</strong> ${escapeHtml(conditions || "None")}</div>
        <div><strong>Main Problem:</strong> ${escapeHtml(med.currentProblem || "-")}</div>
        <div><strong>Duration:</strong> ${escapeHtml(med.problemDuration || "-")} · <strong>Severity:</strong> ${escapeHtml(med.severity || "Mild")}</div>
      </div>
      ${med.otherNotes ? `<div class="qx-mt"><strong>Notes:</strong> ${escapeHtml(med.otherNotes)}</div>` : ""}`;
  } catch (err) {
    /* silent */
  }
}

function openModal(html) {
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modalBackdrop").classList.add("show");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("queueDisplayBtn").addEventListener("click", () => {
    window.location.href = "queue-display.html";
  });
  document.getElementById("notifBtn").addEventListener("click", toggleNotifications);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("logoutLink").addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
  document.getElementById("markAllReadBtn").addEventListener("click", markAllRead);
  document.getElementById("bkDepartment").addEventListener("change", loadDoctors);
  document.getElementById("submitBookingBtn").addEventListener("click", submitBooking);
  document.getElementById("bkAddress").addEventListener("input", updateDistancePreview);
  document.getElementById("gpsBtn").addEventListener("click", fetchCurrentLocation);
  document.getElementById("sosBtn").addEventListener("click", openSosModal);
  document.getElementById("suratAreas").innerHTML =
    (window.QX_LOCALITIES || []).map((l) => `<option value="${escapeHtml(l.name)}"></option>`).join("");
  init();
});

document.getElementById("doctorPicker").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-doc]");
  if (!btn || btn.disabled) return;
  selectSlot(btn.dataset.doc, btn.dataset.slot, btn);
});

function findMyBooking(tokenId) {
  return myBookings.find((b) => b.tokenId === tokenId);
}

document.getElementById("currentTokenBox").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "cancel") cancelToken(btn.dataset.token);
  else if (btn.dataset.action === "pass") {
    const booking = findMyBooking(btn.dataset.token);
    if (booking) openTokenPass(booking);
  }
});

document.getElementById("tokensTable").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "cancel") cancelToken(btn.dataset.token);
  else if (btn.dataset.action === "pass") {
    const booking = findMyBooking(btn.dataset.token);
    if (booking) openTokenPass(booking);
  }
});
