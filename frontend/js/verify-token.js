function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function verifyStatusBlock(data) {
  if (!data || typeof data.valid !== "boolean") {
    return `<div class="qx-verify-msg err">⚠️ Could not verify this token.</div>`;
  }
  if (data.valid) {
    return `<div class="qx-verify-msg ok">✓ Valid appointment pass — ${escapeHtml(data.status.replace(/_/g, " "))}</div>`;
  }
  return `<div class="qx-verify-msg warn">⏳ ${escapeHtml(data.message)}</div>`;
}

function renderVerified(data) {
  const qr = qrDataURL(window.location.href, 7, 3);
  const dist = data.distanceKm ? `<b>${formatDistance(data.distanceKm)} from hospital</b>` : `<b>-</b>`;
  const box = document.getElementById("verifyBox");
  box.innerHTML = `
    <div class="qx-verify-card">
      <div class="qx-verify-head">
        <div class="qx-verify-brand">
          <span class="qx-brand-badge">🏥</span>
          <div>QueueX<small>New Civil Hospital, Surat</small></div>
        </div>
        <div class="qx-verify-token">${escapeHtml(data.tokenId)}</div>
      </div>
      <div class="qx-verify-body">
        ${verifyStatusBlock(data)}
        <div style="font-size:18px;font-weight:800;">${escapeHtml(data.patientName)}</div>
        <div class="qx-muted" style="margin-bottom:6px;">${escapeHtml(data.address || "")}</div>
        <div class="qx-verify-grid">
          <div><span>Doctor</span><b>${escapeHtml(data.doctorName)}</b></div>
          <div><span>Department</span><b>${escapeHtml(data.doctorDept || "")}</b></div>
          <div><span>Room</span><b>${escapeHtml(data.roomNo || "-")}</b></div>
          <div><span>Date</span><b>${escapeHtml(data.bookingDate)}</b></div>
          <div><span>Time slot</span><b>${escapeHtml(data.slotTime)}</b></div>
          <div><span>Distance</span>${dist}</div>
          ${data.primarySymptom
            ? `<div><span>Main symptom</span><b>${escapeHtml(data.primarySymptom)}</b></div>`
            : `<div><span>Status</span>${statusBadge(data.status)}</div>`}
        </div>
        ${qr ? `
        <div class="qx-verify-scan">
          <div style="text-align:center;">
            <img src="${qr}" alt="QR code for ${escapeHtml(data.tokenId)}" width="128" height="128" style="border:1px solid var(--qx-border);border-radius:12px;padding:6px;">
            <div class="qx-muted" style="font-size:12px;margin-top:6px;">Scan this QR at the OPD counter</div>
          </div>
        </div>` : ""}
        <div class="qx-modal-actions qx-print-hide">
          <button class="qx-btn qx-btn-success" id="verifyPrintBtn">🖨 Print token pass</button>
        </div>
      </div>
    </div>`;
  document.getElementById("verifyPrintBtn").addEventListener("click", () => window.print());
}

function renderError(message) {
  const box = document.getElementById("verifyBox");
  box.innerHTML = `
    <div class="qx-verify-card">
      <div class="qx-verify-head">
        <div class="qx-verify-brand">
          <span class="qx-brand-badge">🏥</span>
          <div>QueueX<small>New Civil Hospital, Surat</small></div>
        </div>
      </div>
      <div class="qx-verify-body">
        <div class="qx-verify-msg err">⚠️ ${escapeHtml(message)}</div>
        <div class="qx-muted">If you scanned this from a printed pass, please ask the OPD counter for assistance.</div>
      </div>
    </div>`;
}

(async function initVerify() {
  const token = getQueryParam("token");
  const sig = getQueryParam("sig");
  if (!token || !sig) {
    renderError("This QR code is missing required token information.");
    return;
  }
  try {
    const data = await api(`/bookings/verify/${encodeURIComponent(token)}?sig=${encodeURIComponent(sig)}`);
    renderVerified(data);
  } catch (err) {
    renderError(err.message || "This token could not be verified.");
  }
})();
