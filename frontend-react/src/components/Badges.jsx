import React from "react";
import { statusBadgeClass, statusLabel, phpStatusBadgeClass, phpStatusLabel } from "../utils/helpers.js";

export function StatusBadge({ status }) {
  return <span className={`qx-badge ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>;
}

export function PhpStatusBadge({ status }) {
  return <span className={`qx-badge ${phpStatusBadgeClass(status)}`}>{phpStatusLabel(status)}</span>;
}

export function SeverityBadge({ severity, severityLabel }) {
  const sev = (severity || "MODERATE").toLowerCase();
  const label = severityLabel || (severity || "MODERATE").replace(/_/g, " ");
  return <span className={`qx-severity-badge ${sev}`}>{label}</span>;
}

export function DoctorAvatar({ doctor, size = "" }) {
  const available = !doctor || !doctor.status || doctor.status === "AVAILABLE";
  const photo = doctor && doctor.photo && String(doctor.photo).trim() ? String(doctor.photo).trim() : "";
  const cls = available ? "" : "off";
  return (
    <div className={`qx-doc-avatar ${size} ${cls}`}>
      {photo ? (
        <img src={photo} alt={doctor?.name || "Doctor"} loading="lazy" />
      ) : (
        <img src="/img/staff-default.svg" alt={doctor?.name || "Doctor"} loading="lazy" />
      )}
      <span className={`qx-doc-status-dot ${cls}`}></span>
    </div>
  );
}