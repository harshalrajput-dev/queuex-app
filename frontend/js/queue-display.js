async function loadBoard() {
  try {
    const res = await api("/queue-display");
    const departments = res.data || [];
    const board = document.getElementById("queueBoard");

    if (!departments.length) {
      board.innerHTML = `<div class="dept-card qx-center">No queue data available.</div>`;
      return;
    }

    board.innerHTML = departments
      .map((dept) => {
        const rows = dept.doctors || [];
        if (!rows.length) {
          return `
            <div class="dept-card">
              <div class="dept-title">${escapeHtml(dept.department)}</div>
              <div class="meta">No doctors scheduled today.</div>
            </div>`;
        }
        return `
          <div class="dept-card">
            <div class="dept-title">${escapeHtml(dept.department)}</div>
            ${rows.map((r) => `
              <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #334155;">
                <div class="meta">${escapeHtml(r.doctor)} · Room ${escapeHtml(r.room || "-")}</div>
                <div class="label">Now Serving</div>
                <div class="serving">${r.nowServing ? escapeHtml(r.nowServing) : "—"}</div>
                <div class="label">Next</div>
                <div class="next-token">${r.next ? escapeHtml(r.next) : "—"}</div>
                <div class="meta qx-mt">
                  Waiting: <strong>${r.waiting}</strong> · Est. wait: <strong>${r.estimatedWaitMinutes} min</strong> (estimate)
                  · ${r.status === "AVAILABLE" ? `<span class="badge-avail">AVAILABLE</span>` : `<span class="badge-unavail">${escapeHtml(r.status.replace(/_/g, " "))}</span>`}
                </div>
              </div>`).join("")}
          </div>`;
      })
      .join("");
  } catch (err) {
    document.getElementById("queueBoard").innerHTML =
      `<div class="dept-card qx-center">Unable to load queue: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadWardOccupancy() {
  try {
    const res = await api("/wards/summary");
    const d = res.data || res;
    document.getElementById("wardTotalBeds").textContent = `Total: ${d.totalBeds ?? "--"}`;
    document.getElementById("wardAvailBeds").textContent = `Available: ${d.availableBeds ?? "--"}`;
    document.getElementById("wardOccupiedBeds").textContent = `Occupied: ${d.occupiedBeds ?? "--"}`;
    document.getElementById("wardOccupancyRate").textContent = `Occupancy: ${d.occupancyRate ?? "--"}%`;
    const wards = d.wards || [];
    const wardCards = document.getElementById("wardCards");
    if (!wards.length) { wardCards.innerHTML = ""; return; }
    wardCards.innerHTML = wards.map((w) => {
      const pct = w.totalBeds > 0 ? Math.round((w.occupiedBeds / w.totalBeds) * 100) : 0;
      const statusColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
      const wardTypeEmoji = { ICU: "🔴", EMERGENCY_TRAUMA: "🟠", GENERAL: "🟢" }[w.wardType] || "⚪";
      return `
        <div class="qx-ward-card">
          <div class="qx-ward-card-title">${wardTypeEmoji} ${escapeHtml(w.name)}</div>
          <div class="qx-ward-card-bedcount">${w.availableBeds} / ${w.totalBeds}</div>
          <div class="qx-ward-card-label">beds available</div>
          <div class="qx-ward-progress-bar"><div class="qx-ward-progress-fill" style="width:${pct}%;background:${statusColor};"></div></div>
          <div class="qx-ward-card-pct" style="color:${statusColor};">${pct}% occupied</div>
        </div>`;
    }).join("");
  } catch (err) {
    document.getElementById("wardCards").innerHTML = `<div class="qx-ward-card qx-muted" style="text-align:center;font-size:12px;">Unable to load ward data</div>`;
  }
}

function tickClock() {
  const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
  document.getElementById("clock").textContent = now;
}

function startRealtime() {
  if (!window.EventSource) return;
  const es = new EventSource(`${API_BASE}/queue-display/events`);
  es.addEventListener("board.updated", () => loadBoard());
  es.addEventListener("ward.updated", () => loadWardOccupancy());
  es.onerror = () => { /* EventSource reconnects automatically */ };
}

document.addEventListener("DOMContentLoaded", () => {
  tickClock();
  setInterval(tickClock, 1000);
  loadBoard();
  loadWardOccupancy();
  startRealtime();
  setInterval(loadBoard, 30000);
  setInterval(loadWardOccupancy, 15000);
});
