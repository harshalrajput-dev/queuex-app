let allDepartments = [];
let allDoctors = [];

async function init() {
  checkHealth();
  try {
    const depRes = await api("/departments");
    allDepartments = depRes.data || [];
    renderDepartments();
  } catch (err) {
    document.getElementById("departmentsList").innerHTML =
      `<div class="qx-alert qx-alert-danger">Unable to load departments. ${escapeHtml(err.message)}</div>`;
  }
  try {
    const docRes = await api("/doctors");
    allDoctors = docRes.data || [];
    renderDoctors();
  } catch (err) {
    document.getElementById("doctorsList").innerHTML =
      `<div class="qx-alert qx-alert-danger">Unable to load doctors. ${escapeHtml(err.message)}</div>`;
  }
}

async function checkHealth() {
  const el = document.getElementById("serverStatus");
  try {
    const res = await api("/health");
    const db = res.data && res.data.database;
    el.textContent = `Server: ${res.data.server} | Database: ${db}`;
    el.style.color = db === "connected" ? "var(--qx-green)" : "var(--qx-red)";
  } catch (err) {
    el.textContent = "Server unavailable";
    el.style.color = "var(--qx-red)";
  }
}

function renderDepartments() {
  const el = document.getElementById("departmentsList");
  if (!allDepartments.length) {
    el.innerHTML = `<div class="qx-alert qx-alert-info">No departments available.</div>`;
    return;
  }
  const icons = ["🫀", "🧠", "🦴", "👁️", "🦷", "🩺", "🧸", "🧴", "👂", "🌸", "🏥", "⚕️"];
  el.innerHTML = allDepartments
    .map((d, i) => `
      <div class="qx-card qx-dept-card">
        <div class="qx-dept-ico">${icons[i % icons.length]}</div>
        <h4>${escapeHtml(d.name)}</h4>
        <p class="qx-muted">${escapeHtml(d.description || "Specialized department with dedicated OPD services.")}</p>
        <div class="qx-doc-meta">
          <span>🕘 OPD: <b>${escapeHtml(d.opdTiming || "09:00 AM - 05:00 PM")}</b></span>
          <span>🚪 ${escapeHtml(d.room || "OPD Block")}</span>
        </div>
        <div class="qx-mt" style="margin-top:auto;">
          ${(d.services || []).slice(0, 4).map((s) => `<span class="qx-dept-chip">${escapeHtml(s)}</span>`).join("")}
        </div>
        <div class="qx-doc-footer">
          <span class="qx-badge confirmed">${escapeHtml((d.availableDays || []).join(", ") || "Mon - Sat")}</span>
          <a class="qx-btn qx-btn-sm qx-btn-success" href="login.html#register">Book Token</a>
        </div>
      </div>`)
    .join("");
}

function renderDoctors() {
  const query = (document.getElementById("doctorSearch")?.value || "").toLowerCase();
  const filtered = allDoctors.filter((doc) => {
    if (!query) return true;
    const hay = `${doc.name} ${doc.department} ${doc.specialization}`.toLowerCase();
    return hay.includes(query);
  });
  const el = document.getElementById("doctorsList");
  if (!filtered.length) {
    el.innerHTML = `<div class="qx-alert qx-alert-info">No doctors available.</div>`;
    return;
  }
  el.innerHTML = filtered
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
            <div class="qx-doc-dept">${escapeHtml(doc.department || "General Medicine")}</div>
          </div>
        </div>
        <div class="qx-doc-spec">${escapeHtml(doc.specialization || doc.qualification || "Consultant Specialist")}</div>
        <div class="qx-doc-meta">
          <span>🚪 Room <b>${escapeHtml(doc.room || "-")}</b></span>
          <span>🕘 <b>${escapeHtml((doc.opdSlots || []).join(", ") || doc.opdTime || "OPD")}</b></span>
        </div>
        <div class="qx-doc-footer">
          ${unavailable
            ? `<span class="qx-badge rejected">${escapeHtml(doc.status.replace(/_/g, " "))}</span>`
            : `<span class="qx-badge confirmed">● Available Now</span>`}
          <a class="qx-btn qx-btn-sm qx-doc-action" href="login.html">Consult</a>
        </div>
      </div>`;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("doctorSearch").addEventListener("input", renderDoctors);
  init();
});
