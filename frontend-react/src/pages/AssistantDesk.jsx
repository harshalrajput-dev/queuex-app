import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import Modal from "../components/Modal.jsx";
import { StatusBadge, SeverityBadge, DoctorAvatar } from "../components/Badges.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, API_BASE } from "../api/client.js";
import {
  downloadBlobPdf,
  emergencyPassPdfUrl,
  formatDateTime,
  formatDistance,
  playEmergencyBeep,
  walkinPassPdfUrl
} from "../utils/helpers.js";
import { printWalkin } from "../utils/printPass.js";

const WAITING = ["PENDING_ASSISTANT", "CONFIRMED"];
const NOW_SERVING = ["PATIENT_ARRIVED", "IN_TREATMENT"];
const CLOSED = ["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"];

const MESSAGE_TEMPLATES = [
  "Sorry, doctor not available, please choose another time slot.",
  "Doctor is on leave today. Please book another day.",
  "The selected time slot is full. Please choose another slot.",
  "Please visit the OPD counter to arrange a new token."
];

const ROOMS = [
  "Room 101 - General Emergency",
  "Room 102 - Trauma Care",
  "Room 105 - Cardiac ICU",
  "Room 201 - Pediatrics Emergency",
  "Room 302 - Main Triage & Observation",
  "Room 305 - Surgical Ward"
];

const AMBULANCES = [
  "GJ-05-AB-1234 (ALS)",
  "GJ-05-AB-8251 (BLS)",
  "GJ-05-CD-5678 (Cardiac 1)",
  "GJ-05-EF-9012 (Trauma 2)",
  "GJ-05-GH-3456 (Emergency Van 3)",
  "GJ-05-IJ-7890 (Quick Response A)",
  "GJ-05-KL-2345 (ICU Mobile 1)",
  "GJ-05-MN-6789 (Disaster Response)",
  "GJ-05-OP-4321 (General 4)",
  "GJ-05-QR-8765 (Support Vehicle)"
];

const INSTRUCTION_PRESETS = [
  "Patient requires immediate cardiac assessment. Prepare ECG, BP monitor, and oxygen support upon arrival.",
  "Severe trauma and accident case. Keep emergency surgical kit, IV fluids, and stretcher ready at entrance.",
  "High fever and respiratory distress. Keep nebulizer and isolation setup ready in the assigned room.",
  "Pediatric emergency case. Assign pediatric specialist and keep child-friendly emergency kit ready.",
  "General urgent consultation and stabilization required. Direct patient immediately to assigned room."
];

const WALKIN_DEPTS = [
  "General Medicine",
  "Cardiology",
  "Orthopedics",
  "Pediatrics",
  "Ophthalmology",
  "Dental",
  "Dermatology",
  "ENT"
];

const SLOTS = [
  "09:00 AM - 11:00 AM",
  "11:00 AM - 01:00 PM",
  "02:00 PM - 04:00 PM",
  "04:00 PM - 06:00 PM"
];

function TemplateChips({ selected, onSelect }) {
  return (
    <div className="qx-template-chips">
      {MESSAGE_TEMPLATES.map((tpl, i) => (
        <button
          type="button"
          key={i}
          className={selected === i ? "selected" : ""}
          onClick={() => onSelect(i)}
        >
          {tpl}
        </button>
      ))}
    </div>
  );
}

function ActionButton({ className = "qx-btn qx-btn-sm", ...props }) {
  return <button className={className} {...props} />;
}

export default function AssistantDesk() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [queue, setQueue] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [confirmedEmergencies, setConfirmedEmergencies] = useState([]);
  const [walkinHistory, setWalkinHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [liveStats, setLiveStats] = useState(null);
  const [ward, setWard] = useState(null);
  const [analyticsVisible, setAnalyticsVisible] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("monthly");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [emergencyAlert, setEmergencyAlert] = useState(null);
  const [modal, setModal] = useState(null);
  const refreshRef = useRef(null);

  const closeModal = useCallback(() => setModal(null), []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await api("/bookings", { auth: true });
      setQueue(Array.isArray(res) ? res : []);
    } catch (err) {
      toast(err.message);
    }
  }, [toast]);

  const loadDoctors = useCallback(async () => {
    try {
      const res = await api("/doctors");
      setDoctors(res.data || []);
    } catch (err) {
      toast(err.message);
    }
  }, [toast]);

  const loadConfirmedEmergencies = useCallback(async () => {
    try {
      const res = await api("/emergency/history", { auth: true });
      setConfirmedEmergencies(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast(err.message);
    }
  }, [toast]);

  const loadWalkinHistory = useCallback(async () => {
    try {
      const res = await api("/assistant/walkin-history", { auth: true });
      setWalkinHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast(err.message);
    }
  }, [toast]);

  const loadLiveStats = useCallback(async () => {
    try {
      const res = await api("/assistant/live-stats", { auth: true });
      setLiveStats(res.data || res);
    } catch (err) {
      /* silent - live stats are non-critical */
    }
  }, []);

  const loadWard = useCallback(async () => {
    try {
      const res = await api("/wards/summary");
      setWard(res.data || res);
    } catch (err) {
      setWard(null);
    }
  }, []);

  const loadActiveEmergency = useCallback(async () => {
    try {
      const res = await api("/emergency", { auth: true });
      const alerts = Array.isArray(res.data) ? res.data : [];
      if (alerts.length) {
        const latest = alerts[0];
        setEmergencyAlert({
          alertId: latest._id,
          patientName: latest.patientName,
          patientMobile: latest.patientMobile,
          patientEmail: latest.patientEmail,
          tokenId: latest.tokenId,
          severity: latest.severity,
          severityLabel: latest.severity ? latest.severity.replace(/_/g, " ") : "",
          customAddress: latest.customAddress,
          distanceKm: latest.distanceKm,
          estimatedTravelMinutes: latest.estimatedTravelMinutes,
          triggeredAt: latest.triggeredAt
        });
      }
    } catch (err) {
      /* silent */
    }
  }, []);

  const loadAnalytics = useCallback(
    async (period) => {
      setAnalyticsPeriod(period);
      setAnalyticsError("");
      try {
        const res = await api(`/assistant/analytics?period=${period}`, { auth: true });
        setAnalytics(res.data || res);
      } catch (err) {
        setAnalyticsError(err.message);
        setAnalytics(null);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    await Promise.all([loadQueue(), loadDoctors(), loadConfirmedEmergencies()]);
    setLastUpdated(new Date().toLocaleTimeString("en-IN"));
  }, [loadQueue, loadDoctors, loadConfirmedEmergencies]);

  refreshRef.current = refresh;

  // Initial load + polling intervals
  useEffect(() => {
    refresh();
    loadLiveStats();
    loadWard();
    loadActiveEmergency();

    const statsTimer = setInterval(loadLiveStats, 10000);
    const refreshTimer = setInterval(() => refreshRef.current && refreshRef.current(), 30000);
    const wardTimer = setInterval(loadWard, 15000);
    return () => {
      clearInterval(statsTimer);
      clearInterval(refreshTimer);
      clearInterval(wardTimer);
    };
  }, [refresh, loadLiveStats, loadWard, loadActiveEmergency]);

  // Realtime SSE
  useEffect(() => {
    if (typeof window.EventSource === "undefined") return undefined;
    const es = new EventSource(`${API_BASE}/queue-display/events`);
    es.addEventListener("board.updated", () => refreshRef.current && refreshRef.current());
    es.addEventListener("emergency.triggered", (e) => {
      try {
        const data = JSON.parse(e.data);
        setEmergencyAlert(data);
        playEmergencyBeep();
        toast(`🚨 EMERGENCY SOS from ${data.patientName || "Unknown patient"}!`);
      } catch (err) {
        /* silent */
      }
    });
    es.addEventListener("emergency.dismissed", () => setEmergencyAlert(null));
    es.addEventListener("emergency.confirmed", (e) => {
      try {
        const data = JSON.parse(e.data);
        setEmergencyAlert(null);
        loadConfirmedEmergencies();
        toast(`✅ Emergency confirmed for ${data.patientName || "patient"} → Room ${data.roomNumber || "?"}`);
      } catch (err) {
        /* silent */
      }
    });
    es.addEventListener("emergency.admitted", () => {
      loadConfirmedEmergencies();
      loadWard();
      toast("🏥 Patient admitted. Emergency SOS locked for 3 days.");
    });
    es.addEventListener("ward.updated", () => loadWard());
    es.onerror = () => {
      /* EventSource reconnects automatically */
    };
    return () => es.close();
  }, [loadConfirmedEmergencies, loadWard, toast]);

  const handleLogout = () => {
    logout();
    navigate("/staff-login");
  };

  const setStatus = async (id, status) => {
    try {
      await api(`/bookings/${id}`, { method: "PUT", auth: true, body: { status } });
      toast(`Status updated to ${status.replace(/_/g, " ").toLowerCase()}.`);
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  };

  const submitReject = async (tokenId, message) => {
    if (!message.trim()) {
      toast("Please enter a reason/message for the patient before rejecting.");
      return;
    }
    try {
      await api(`/bookings/${tokenId}`, { method: "PUT", auth: true, body: { status: "REJECTED", message } });
      closeModal();
      toast(`${tokenId} rejected and patient notified.`);
      await refresh();
    } catch (err) {
      toast(err.message);
    }
  };

  const submitReschedule = async (tokenId, bookingDate, slotTime, message) => {
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
  };

  const submitWalkin = async (payload) => {
    if (!payload.patientName.trim()) {
      toast("Patient name is required.");
      return;
    }
    if (!payload.patientMobile.trim()) {
      toast("Mobile number is required.");
      return;
    }
    try {
      const res = await api("/assistant/walkin-token", { method: "POST", auth: true, body: payload });
      const data = res.data || res;
      toast(`✅ Walk-in token ${data.tokenId} generated for ${data.patientName}!`);
      setModal({ type: "walkin-pass", data });
      await Promise.all([refresh(), loadWalkinHistory()]);
    } catch (err) {
      toast(err.message);
    }
  };

  const confirmEmergency = async (payload) => {
    if (!payload.roomNumber) {
      toast("Please select a target room.");
      return;
    }
    try {
      const res = await api("/emergency/confirm", {
        method: "POST",
        auth: true,
        body: {
          alertId: payload.alertId,
          roomNumber: payload.roomNumber,
          ambulanceNumber: payload.ambulanceNumber || "",
          instructions: payload.instructions || ""
        }
      });
      closeModal();
      setEmergencyAlert(null);
      toast(`✅ ${res.message || "Emergency confirmed. Digital pass available for patient."}`);
      await loadConfirmedEmergencies();
    } catch (err) {
      toast(err.message);
    }
  };

  const dismissEmergency = async (reason) => {
    if (!emergencyAlert) return;
    try {
      await api(`/emergency/${emergencyAlert.alertId}/dismiss`, {
        method: "PUT",
        auth: true,
        body: { reason: reason || "False alarm" }
      });
      closeModal();
      setEmergencyAlert(null);
      toast("Emergency alert dismissed.");
    } catch (err) {
      toast(err.message);
    }
  };

  const admitEmergency = async (alertId, patientName) => {
    if (!window.confirm(`Mark ${patientName} as Arrived & Admitted?\n\nThis will lock their Emergency SOS button for 3 days.`)) {
      return;
    }
    try {
      const res = await api("/emergency/admit", { method: "POST", auth: true, body: { alertId } });
      toast(`✅ ${res.message || patientName + " admitted. SOS locked for 3 days."}`);
      await loadConfirmedEmergencies();
    } catch (err) {
      toast(err.message);
    }
  };

  const downloadEmergencyPass = async (alertId) => {
    toast("Generating emergency pass PDF...");
    try {
      await downloadBlobPdf(`emergency-pass-${alertId}.pdf`, emergencyPassPdfUrl(alertId), true);
      toast("Emergency pass downloaded successfully.");
    } catch (err) {
      toast(err.message || "Failed to download emergency pass.");
    }
  };

  const downloadWalkinPass = async (tokenId) => {
    toast("Generating walk-in pass PDF...");
    try {
      await downloadBlobPdf(`walkin-pass-${tokenId}.pdf`, walkinPassPdfUrl(tokenId), true);
      toast("Walk-in pass downloaded successfully.");
    } catch (err) {
      toast(err.message || "Failed to download walk-in pass.");
    }
  };

  // Derived: stats
  const stats = useMemo(() => {
    const s = (b) => (b.status || "").toUpperCase();
    return [
      { label: "Total Tokens", num: queue.length, ico: "🎟️" },
      { label: "Waiting", num: queue.filter((b) => WAITING.includes(s(b))).length, ico: "⏳" },
      { label: "Now Serving", num: queue.filter((b) => NOW_SERVING.includes(s(b))).length, ico: "🩺" },
      { label: "Completed", num: queue.filter((b) => s(b) === "COMPLETED").length, ico: "🏁" },
      { label: "Cancelled", num: queue.filter((b) => s(b) === "CANCELLED" || s(b) === "REJECTED").length, ico: "🚫" }
    ];
  }, [queue]);

  const filteredQueue = useMemo(() => {
    let rows = queue;
    if (activeTab === "waiting") rows = rows.filter((b) => WAITING.includes((b.status || "").toUpperCase()));
    else if (activeTab === "now-serving") rows = rows.filter((b) => NOW_SERVING.includes((b.status || "").toUpperCase()));
    else if (activeTab === "completed") rows = rows.filter((b) => (b.status || "").toUpperCase() === "COMPLETED");
    else if (activeTab === "cancelled") rows = rows.filter((b) => CLOSED.includes((b.status || "").toUpperCase()) && (b.status || "").toUpperCase() !== "COMPLETED");

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((b) =>
        `${b.tokenId} ${b.patientName} ${b.doctorName} ${b.doctorDept || ""}`.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [queue, activeTab, search]);

  const actionButtons = (b) => {
    const s = (b.status || "").toUpperCase();
    const id = b._id;
    const out = [];
    if (s === "PENDING_ASSISTANT") {
      out.push(
        <ActionButton key="confirm" className="qx-btn qx-btn-success qx-btn-sm" onClick={() => setStatus(id, "CONFIRMED")}>
          Confirm
        </ActionButton>
      );
    } else if (s === "CONFIRMED") {
      out.push(
        <ActionButton key="arrive" className="qx-btn qx-btn-sm" onClick={() => setStatus(id, "PATIENT_ARRIVED")}>
          Patient Arrived
        </ActionButton>
      );
    } else if (s === "PATIENT_ARRIVED") {
      out.push(
        <ActionButton key="start" className="qx-btn qx-btn-sm" onClick={() => setStatus(id, "IN_TREATMENT")}>
          Start Treatment
        </ActionButton>
      );
    } else if (s === "IN_TREATMENT") {
      out.push(
        <ActionButton key="done" className="qx-btn qx-btn-success qx-btn-sm" onClick={() => setStatus(id, "COMPLETED")}>
          Complete
        </ActionButton>
      );
    } else {
      out.push(
        <ActionButton key="back" className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => setStatus(id, "PENDING_ASSISTANT")}>
          Back to Waiting
        </ActionButton>
      );
    }
    if (!CLOSED.includes(s)) {
      out.push(
        <ActionButton key="cancel" className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => setStatus(id, "CANCELLED")}>
          Cancel
        </ActionButton>
      );
    }
    out.push(
      <ActionButton key="view" className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => setModal({ type: "profile", data: b })}>
        View
      </ActionButton>
    );
    out.push(
      <ActionButton key="resched" className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => setModal({ type: "reschedule", data: b })}>
        Reschedule
      </ActionButton>
    );
    out.push(
      <ActionButton key="reject" className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => setModal({ type: "reject", data: b })}>
        Reject
      </ActionButton>
    );
    return out;
  };

  const tabs = [
    { key: "all", label: "All Data" },
    { key: "waiting", label: "Waiting" },
    { key: "now-serving", label: "Now Serving" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
    { key: "walkin", label: "🚶 Walk-in" },
    { key: "emergencies", label: "Confirmed Emergencies History" }
  ];

  const onTab = (key) => {
    setActiveTab(key);
    if (key === "walkin") loadWalkinHistory();
  };

  const liveStatCards = [
    { label: "Active Logins", value: liveStats?.activeLogins ?? 0, icon: "👥", bg: "linear-gradient(140deg, rgba(59,130,246,0.18), rgba(96,165,250,0.18))", border: "rgba(59,130,246,0.35)" },
    { label: "Today's Tokens", value: liveStats?.todayBookings ?? 0, icon: "🎟️", bg: "linear-gradient(140deg, rgba(245,158,11,0.18), rgba(251,191,36,0.18))", border: "rgba(245,158,11,0.35)" },
    { label: "Completed Today", value: liveStats?.completedToday ?? 0, icon: "✅", bg: "linear-gradient(140deg, rgba(16,185,129,0.18), rgba(52,211,153,0.18))", border: "rgba(16,185,129,0.35)" },
    { label: "Pending Today", value: liveStats?.pendingToday ?? 0, icon: "⏳", bg: "linear-gradient(140deg, rgba(239,68,68,0.18), rgba(248,113,113,0.18))", border: "rgba(239,68,68,0.35)" },
    { label: "Total Tokens", value: liveStats?.totalBookings ?? 0, icon: "📋", bg: "linear-gradient(140deg, rgba(45,212,191,0.18), rgba(34,211,238,0.18))", border: "rgba(45,212,191,0.35)" }
  ];

  return (
    <div>
      <Topbar
        brandSmall="Hospital Assistant Control Desk"
        navLinks={[
          { label: "Live Queue", to: "/queue" },
          { label: "Home", to: "/" }
        ]}
      >
        <span className="qx-nav-user">
          <img
            className="qx-avatar"
            alt=""
            src={user?.profilePhoto || "/img/staff-default.svg"}
          />
          <span>{user?.name || ""}</span>
        </span>
        <button className="qx-btn qx-btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </Topbar>

      <main className="container">
        {emergencyAlert && (
          <div className="qx-emergency-banner">
            <div className="qx-emergency-banner-inner">
              <div className="qx-emergency-banner-pulse"></div>
              <div className="qx-emergency-banner-content">
                <div className="qx-emergency-banner-header">
                  <span className="qx-emergency-banner-icon">🚨</span>
                  <strong>EMERGENCY SOS ALERT</strong>
                  {emergencyAlert.severity && (
                    <SeverityBadge severity={emergencyAlert.severity} severityLabel={emergencyAlert.severityLabel} />
                  )}
                </div>
                <div className="qx-emergency-banner-details">
                  <div className="qx-emergency-banner-info">
                    <span>
                      <strong>Patient:</strong> {emergencyAlert.patientName || "Unknown"}
                    </span>
                    <span>
                      <strong>Mobile:</strong> {emergencyAlert.patientMobile || "-"}
                    </span>
                    <span>
                      <strong>Email:</strong> {emergencyAlert.patientEmail || "-"}
                    </span>
                    {emergencyAlert.tokenId && (
                      <span>
                        <strong>Token:</strong> {emergencyAlert.tokenId}
                      </span>
                    )}
                    <span>
                      <strong>Time:</strong>{" "}
                      {emergencyAlert.triggeredAt
                        ? new Date(emergencyAlert.triggeredAt).toLocaleTimeString("en-IN")
                        : new Date().toLocaleTimeString("en-IN")}
                    </span>
                  </div>
                </div>
                {(emergencyAlert.customAddress || emergencyAlert.distanceKm != null) && (
                  <div className="qx-emergency-banner-location">
                    {emergencyAlert.customAddress && <span>📍 {emergencyAlert.customAddress}</span>}
                    {emergencyAlert.distanceKm != null && (
                      <span className="loc-distance">📏 {String(emergencyAlert.distanceKm)} km from hospital</span>
                    )}
                    {emergencyAlert.estimatedTravelMinutes != null && (
                      <span className="loc-eta">⏱ ~{String(emergencyAlert.estimatedTravelMinutes)} min ETA</span>
                    )}
                  </div>
                )}
              </div>
              <div className="qx-emergency-banner-actions">
                <button
                  className="qx-btn qx-btn-danger qx-btn-sm qx-emergency-confirm-btn"
                  onClick={() => setModal({ type: "confirm-emergency", data: emergencyAlert })}
                >
                  ✓ Confirm &amp; Assign Room
                </button>
                <button
                  className="qx-btn qx-btn-outline qx-btn-sm"
                  onClick={() => setModal({ type: "dismiss-emergency" })}
                >
                  Dismiss False Alarm
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="qx-flex qx-wrap" style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>Assistant Control Desk</h2>
            <p className="qx-section-sub" style={{ margin: "6px 0 0" }}>
              Real-time token management &amp; patient queue oversight
            </p>
          </div>
          <div className="qx-flex qx-wrap" style={{ gap: 8 }}>
            <button
              className="qx-btn qx-btn-outline qx-btn-sm"
              onClick={() => {
                const next = !analyticsVisible;
                setAnalyticsVisible(next);
                if (next) loadAnalytics(analyticsPeriod);
              }}
            >
              📊 Analytics
            </button>
            <button className="qx-btn qx-btn-success qx-btn-sm" onClick={() => setModal({ type: "walkin" })}>
              + Generate Walk-in Token
            </button>
            <div className="est-banner" style={{ margin: 0 }}>
              Last update: <span>{lastUpdated || "-"}</span>
            </div>
          </div>
        </div>

        <div className="qx-live-stats-row qx-mb">
          {liveStatCards.map((card) => (
            <div className="qx-live-stat" key={card.label}>
              <div
                className="qx-live-stat-icon"
                style={{ background: card.bg, borderColor: card.border }}
              >
                {card.icon}
              </div>
              <div className="qx-live-stat-content">
                <b>{card.value}</b>
                <span>{card.label}</span>
              </div>
              <div className="qx-live-pulse"></div>
            </div>
          ))}
        </div>

        <div className="qx-grid qx-grid-4 qx-mb">
          {stats.map((st) => (
            <div className="qx-kpi" key={st.label}>
              <div className="qx-kpi-ico">{st.ico}</div>
              <div>
                <b>{st.num}</b>
                <span>{st.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="qx-ward-panel qx-mb">
          <div className="qx-ward-panel-header">
            <span style={{ fontWeight: 700, fontSize: 14 }}>🛏️ Ward &amp; Bed Occupancy</span>
            <div className="qx-ward-panel-stats">
              <span className="qx-ward-stat qx-ward-stat-green">
                Available: {ward ? ward.availableBeds : "--"}
              </span>
              <span className="qx-ward-stat qx-ward-stat-red">
                Occupied: {ward ? ward.occupiedBeds : "--"}
              </span>
              <span className="qx-ward-stat qx-ward-stat-yellow">
                {ward ? `${ward.occupancyRate}` : "--"}%
              </span>
            </div>
          </div>
          <div className="qx-ward-cards qx-ward-cards-sm">
            {ward && (ward.wards || []).length
              ? ward.wards.map((w) => {
                  const pct = w.totalBeds > 0 ? Math.round((w.occupiedBeds / w.totalBeds) * 100) : 0;
                  const statusColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
                  const emoji = { ICU: "🔴", EMERGENCY_TRAUMA: "🟠", GENERAL: "🟢" }[w.wardType] || "⚪";
                  return (
                    <div className="qx-ward-card qx-ward-card-sm" key={w._id || w.name}>
                      <div className="qx-ward-card-title-sm">
                        {emoji} {w.name}
                      </div>
                      <div className="qx-ward-card-bedcount-sm">
                        {w.availableBeds} / {w.totalBeds} beds available
                      </div>
                      <div className="qx-ward-progress-bar-sm">
                        <div
                          className="qx-ward-progress-fill-sm"
                          style={{ width: `${pct}%`, background: statusColor }}
                        ></div>
                      </div>
                      <div className="qx-ward-card-pct-sm" style={{ color: statusColor }}>
                        {pct}%
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </div>

        {analyticsVisible && (
          <div className="qx-panel qx-mb">
            <div className="qx-panel-head">
              <h3 style={{ margin: 0 }}>📊 Analytics Overview</h3>
              <div className="qx-flex qx-wrap" style={{ gap: 6 }}>
                <button
                  className={`qx-btn qx-btn-sm qx-btn-outline analytics-period ${analyticsPeriod === "monthly" ? "active" : ""}`}
                  onClick={() => loadAnalytics("monthly")}
                >
                  Monthly
                </button>
                <button
                  className={`qx-btn qx-btn-sm qx-btn-outline analytics-period ${analyticsPeriod === "weekly" ? "active" : ""}`}
                  onClick={() => loadAnalytics("weekly")}
                >
                  Weekly
                </button>
              </div>
            </div>
            <div>
              {analyticsError && <div className="qx-alert qx-alert-danger">{analyticsError}</div>}
              {!analyticsError && !analytics && <div className="qx-muted qx-center" style={{ padding: 16 }}>Loading analytics…</div>}
              {analytics && (
                <>
                  <div className="qx-analytics-summary qx-mb">
                    <div className="qx-analytics-kpi">
                      <div className="qx-analytics-kpi-num">{analytics.totalBookings}</div>
                      <div className="qx-analytics-kpi-label">Total Bookings</div>
                    </div>
                    {Object.entries(analytics.statusCounts || {}).map(([status, count]) => (
                      <div className="qx-analytics-kpi" key={status}>
                        <div className="qx-analytics-kpi-num">{count}</div>
                        <div className="qx-analytics-kpi-label">{status.replace(/_/g, " ").toLowerCase()}</div>
                      </div>
                    ))}
                  </div>

                  {analytics.dailyBreakdown && analytics.dailyBreakdown.length > 0 && (
                    <div className="qx-analytics-section">
                      <h4>Daily Breakdown</h4>
                      <div className="qx-chart-bars">
                        {analytics.dailyBreakdown.map((day) => (
                          <div className="qx-chart-bar-col" key={day.date}>
                            <div className="qx-chart-bar">
                              <div className="qx-chart-bar-val">{day.total}</div>
                            </div>
                            <div className="qx-chart-bar-label">
                              {String(day.label || "").split(" ").slice(0, 2).join(" ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analytics.weeklyBreakdown && analytics.weeklyBreakdown.length > 0 && (
                    <div className="qx-analytics-section">
                      <h4>Weekly Breakdown</h4>
                      <div className="qx-weekly-grid">
                        {analytics.weeklyBreakdown.map((week) => (
                          <div className="qx-weekly-card" key={week.week || week.label}>
                            <div className="qx-weekly-header">{week.label}</div>
                            <div className="qx-weekly-stats">
                              <div>
                                <b>{week.total}</b>
                                <span>Total</span>
                              </div>
                              <div>
                                <b style={{ color: "#059669" }}>{week.completed}</b>
                                <span>Completed</span>
                              </div>
                              <div>
                                <b style={{ color: "#f59e0b" }}>{week.pending}</b>
                                <span>Pending</span>
                              </div>
                              <div>
                                <b style={{ color: "#ef4444" }}>{week.rejected}</b>
                                <span>Rejected</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analytics.doctorBreakdown && analytics.doctorBreakdown.length > 0 && (
                    <div className="qx-analytics-section">
                      <h4>Top Doctors by Volume</h4>
                      <div className="qx-table-wrap">
                        <table className="qx-table">
                          <thead>
                            <tr>
                              <th>Doctor</th>
                              <th>Total Tokens</th>
                              <th>Completed</th>
                              <th>Completion Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.doctorBreakdown.map((doc) => {
                              const rate = doc.total > 0 ? Math.round((doc.completed / doc.total) * 100) : 0;
                              const cls = rate >= 70 ? "confirmed" : rate >= 40 ? "pending" : "rejected";
                              return (
                                <tr key={doc.name}>
                                  <td>
                                    <strong>{doc.name}</strong>
                                  </td>
                                  <td>{doc.total}</td>
                                  <td>{doc.completed}</td>
                                  <td>
                                    <span className={`qx-badge ${cls}`}>{rate}%</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="qx-tabs qx-mb">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`qx-tab ${activeTab === t.key ? "active" : ""}`}
              onClick={() => onTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "emergencies" && (
          <div className="qx-panel qx-mb">
            <div className="qx-panel-head">
              <h3 style={{ margin: 0 }}>Confirmed Emergencies History</h3>
              <span className="qx-chip qx-chip-live">
                <span className="pulse-dot"></span> Live updates
              </span>
            </div>
            <div className="qx-table-wrap">
              <table className="qx-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient</th>
                    <th>Severity</th>
                    <th>Address / Distance</th>
                    <th>Room</th>
                    <th>Ambulance</th>
                    <th>Instructions</th>
                    <th>Status</th>
                    <th>Confirmed At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmedEmergencies.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="qx-muted qx-center" style={{ padding: 24 }}>
                        No confirmed emergencies yet. Confirmed cases will appear here.
                      </td>
                    </tr>
                  ) : (
                    confirmedEmergencies.map((a) => {
                      const isAdmitted = a.status === "ADMITTED";
                      return (
                        <tr key={a._id}>
                          <td>
                            <strong>{a.tokenId || "-"}</strong>
                          </td>
                          <td>
                            <strong>{a.patientName || "-"}</strong>
                            <br />
                            <span className="qx-muted">{a.patientMobile || ""}</span>
                          </td>
                          <td>
                            <SeverityBadge severity={a.severity} />
                          </td>
                          <td>
                            {a.customAddress && (
                              <div className="qx-emergency-address" title={a.customAddress}>
                                {a.customAddress}
                              </div>
                            )}
                            {a.distanceKm != null && (
                              <div className="qx-emergency-distance">📏 {String(a.distanceKm)} km</div>
                            )}
                            {a.estimatedTravelMinutes != null && (
                              <div className="qx-emergency-eta">⏱ ~{String(a.estimatedTravelMinutes)} min</div>
                            )}
                          </td>
                          <td>
                            <span className="qx-badge confirmed">{a.roomNumber || "-"}</span>
                          </td>
                          <td>{a.ambulanceNumber || "-"}</td>
                          <td className="qx-muted" style={{ maxWidth: 180 }}>
                            {a.instructions || "-"}
                          </td>
                          <td>
                            {isAdmitted ? (
                              <span className="qx-badge admitted">ADMITTED</span>
                            ) : (
                              <span className="qx-badge confirmed">CONFIRMED</span>
                            )}
                          </td>
                          <td className="qx-muted">
                            {a.confirmedAt ? new Date(a.confirmedAt).toLocaleString("en-IN") : "-"}
                          </td>
                          <td>
                            <div className="qx-action-col">
                              <ActionButton
                                className="qx-btn qx-btn-outline qx-btn-sm"
                                onClick={() => downloadEmergencyPass(a._id)}
                              >
                                📥 Pass
                              </ActionButton>
                              {!isAdmitted && (
                                <ActionButton
                                  className="qx-btn qx-btn-success qx-btn-sm"
                                  onClick={() => admitEmergency(a._id, a.patientName || "")}
                                >
                                  ✅ Arrived &amp; Admitted
                                </ActionButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "walkin" && (
          <div className="qx-panel qx-mb">
            <div className="qx-panel-head">
              <h3 style={{ margin: 0 }}>🚶 Offline / Walk-in Patients</h3>
              <div className="qx-flex qx-wrap" style={{ gap: 8 }}>
                <span className="qx-chip qx-chip-live">
                  <span className="pulse-dot"></span> Live updates
                </span>
              </div>
            </div>
            <div>
              {walkinHistory.length === 0 ? (
                <div className="qx-muted qx-center" style={{ padding: 24 }}>
                  No offline / walk-in patients found. Generated walk-in tokens will appear here.
                </div>
              ) : (
                <div className="qx-table-wrap">
                  <table className="qx-table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Patient Name</th>
                        <th>Department</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walkinHistory.map((b) => (
                        <tr key={b._id || b.tokenId}>
                          <td>
                            <strong>{b.tokenId}</strong>
                          </td>
                          <td>
                            <strong>{b.patientName}</strong>
                          </td>
                          <td>{b.doctorDept || b.doctorName || "-"}</td>
                          <td className="qx-muted">{formatDateTime(b.createdAt)}</td>
                          <td>
                            <StatusBadge status={b.status} />
                          </td>
                          <td>
                            <div className="qx-action-col">
                              <ActionButton
                                className="qx-btn qx-btn-outline qx-btn-sm"
                                onClick={() => downloadWalkinPass(b.tokenId)}
                              >
                                📥 PDF
                              </ActionButton>
                              <ActionButton
                                className="qx-btn qx-btn-sm"
                                onClick={() =>
                                  printWalkin({
                                    tokenId: b.tokenId,
                                    patientName: b.patientName,
                                    patientMobile: b.patientMobile || "",
                                    doctorName: b.doctorName || "",
                                    doctorDept: b.doctorDept || "",
                                    bookingDate: b.bookingDate || "",
                                    slotTime: b.slotTime || "-",
                                    symptoms:
                                      (b.symptoms && b.symptoms.primary) || b.symptoms || "Walk-in consultation"
                                  })
                                }
                              >
                                🖨 Print Pass
                              </ActionButton>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab !== "emergencies" && activeTab !== "walkin" && (
          <div className="qx-panel qx-mb">
            <div className="qx-panel-head">
              <h3 style={{ margin: 0 }}>Queue Board</h3>
              <div className="qx-search" style={{ flex: "0 1 300px", minWidth: 220 }}>
                <input
                  type="search"
                  placeholder="Search patient / token / doctor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="qx-table-wrap">
              <table className="qx-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Patient</th>
                    <th>Department</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="qx-muted qx-center">
                        No tokens found.
                      </td>
                    </tr>
                  ) : (
                    filteredQueue.map((b) => (
                      <tr key={b._id || b.tokenId} data-status={b.status}>
                        <td>
                          <strong>{b.tokenId}</strong>
                        </td>
                        <td>
                          <strong>{b.patientName}</strong>
                        </td>
                        <td>{b.doctorDept || b.doctorName || "-"}</td>
                        <td className="qx-muted">{formatDateTime(b.createdAt) || b.bookingDate || "-"}</td>
                        <td>
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="qx-action-cell">
                          <div className="qx-action-col">{actionButtons(b)}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="qx-panel">
          <div className="qx-panel-head">
            <h3 style={{ margin: 0 }}>Doctors &amp; Availability</h3>
            <span className="qx-chip qx-chip-live">
              <span className="pulse-dot"></span> Live availability
            </span>
          </div>
          <div className="qx-grid qx-grid-3">
            {doctors.length === 0 ? (
              <div className="qx-alert qx-alert-info">No doctors available.</div>
            ) : (
              doctors.map((doc) => {
                const unavailable = doc.status && doc.status !== "AVAILABLE";
                return (
                  <div className="qx-card qx-doc-card" key={doc._id || doc.name}>
                    <div className="qx-doc-top">
                      <DoctorAvatar doctor={doc} />
                      <div>
                        <h4 className="qx-doc-name">{doc.name}</h4>
                        <div className="qx-doc-dept">
                          {doc.department || "General Medicine"} · Room {doc.room || "-"}
                        </div>
                      </div>
                    </div>
                    <div className="qx-doc-spec">{doc.specialization || doc.qualification || "Consultant Specialist"}</div>
                    <div className="qx-doc-meta">
                      <span>
                        🕘 <b>{(doc.opdSlots || []).join(", ") || doc.opdTime || "OPD"}</b>
                      </span>
                      <span>🏥 {doc.department || "-"}</span>
                    </div>
                    <div className="qx-doc-footer">
                      {unavailable ? (
                        <span className="qx-badge rejected">{doc.status.replace(/_/g, " ")}</span>
                      ) : (
                        <span className="qx-badge confirmed">● Available</span>
                      )}
                      {unavailable ? (
                        <span className="qx-status-label">Unavailable today</span>
                      ) : (
                        <span className="qx-chip qx-chip-live">
                          <span className="pulse-dot"></span> On duty
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      <Footer />

      {modal && modal.type === "walkin" && <WalkinModal onClose={closeModal} onSubmit={submitWalkin} />}

      {modal && modal.type === "walkin-pass" && (
        <WalkinPassModal
          data={modal.data}
          onClose={closeModal}
          onPrint={() => printWalkin(modal.data)}
          onDownload={() => downloadWalkinPass(modal.data.tokenId)}
        />
      )}

      {modal && modal.type === "reject" && (
        <RejectModal
          booking={modal.data}
          onClose={closeModal}
          onSubmit={(message) => submitReject(modal.data.tokenId, message)}
        />
      )}

      {modal && modal.type === "reschedule" && (
        <RescheduleModal
          booking={modal.data}
          doctors={doctors}
          onClose={closeModal}
          onSubmit={(bookingDate, slotTime, message) => submitReschedule(modal.data.tokenId, bookingDate, slotTime, message)}
        />
      )}

      {modal && modal.type === "profile" && <ProfileModal booking={modal.data} onClose={closeModal} />}

      {modal && modal.type === "confirm-emergency" && (
        <ConfirmEmergencyModal alert={modal.data} onClose={closeModal} onSubmit={confirmEmergency} />
      )}

      {modal && modal.type === "dismiss-emergency" && (
        <DismissEmergencyModal onClose={closeModal} onSubmit={dismissEmergency} />
      )}
    </div>
  );
}

/* ---------------- Modals ---------------- */

function WalkinModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    patientName: "",
    patientMobile: "",
    patientAge: "",
    patientEmail: "",
    doctorDept: WALKIN_DEPTS[0],
    slotTime: SLOTS[0],
    symptoms: ""
  });
  const nameRef = useRef(null);
  useEffect(() => {
    if (nameRef.current) nameRef.current.focus();
  }, []);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal
      title="🏥 Generate Walk-in Token"
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="qx-btn qx-btn-success qx-btn-sm" onClick={() => onSubmit(form)}>
            🎟️ Generate Token
          </button>
        </>
      }
    >
      <p className="qx-muted" style={{ margin: "4px 0 14px" }}>
        Register an offline/walk-in patient and generate an active token instantly.
      </p>
      <div className="qx-action-form">
        <div className="qx-form-row">
          <div>
            <label className="qx-form-label">Patient Name *</label>
            <input ref={nameRef} type="text" placeholder="Enter patient name" value={form.patientName} onChange={set("patientName")} />
          </div>
          <div>
            <label className="qx-form-label">Mobile Number *</label>
            <input type="tel" placeholder="Enter mobile number" value={form.patientMobile} onChange={set("patientMobile")} />
          </div>
        </div>
        <div className="qx-form-row">
          <div>
            <label className="qx-form-label">Age</label>
            <input type="number" placeholder="Age" min="0" max="120" value={form.patientAge} onChange={set("patientAge")} />
          </div>
          <div>
            <label className="qx-form-label">Email (optional)</label>
            <input type="email" placeholder="patient@email.com" value={form.patientEmail} onChange={set("patientEmail")} />
          </div>
        </div>
        <div className="qx-form-row">
          <div>
            <label className="qx-form-label">Department</label>
            <select value={form.doctorDept} onChange={set("doctorDept")}>
              {WALKIN_DEPTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="qx-form-label">Time Slot</label>
            <select value={form.slotTime} onChange={set("slotTime")}>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="qx-form-label">Symptom / Chief Complaint</label>
          <textarea
            placeholder="Enter primary symptom or reason for visit..."
            style={{ minHeight: 60 }}
            value={form.symptoms}
            onChange={set("symptoms")}
          ></textarea>
        </div>
      </div>
    </Modal>
  );
}

function WalkinPassModal({ data, onClose, onPrint, onDownload }) {
  const symptoms = (data.symptoms && data.symptoms.primary) || data.symptoms || "Walk-in consultation";
  return (
    <Modal
      title="✅ Token Generated Successfully"
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Close
          </button>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onDownload}>
            📥 Download PDF
          </button>
          <button className="qx-btn qx-btn-success qx-btn-sm" onClick={onPrint}>
            🖨 Print Pass
          </button>
        </>
      }
    >
      <div className="qx-walkin-pass">
        <div className="qx-walkin-pass-header">
          <span className="qx-brand-badge">🏥</span>
          <div>
            <strong>QueueX Walk-in Token</strong>
            <small>New Civil Hospital, Surat</small>
          </div>
        </div>
        <div className="qx-walkin-token-number">{data.tokenId}</div>
        <div className="qx-walkin-pass-body">
          <div className="qx-walkin-pass-grid">
            <div>
              <span>Patient</span>
              <b>{data.patientName}</b>
            </div>
            <div>
              <span>Mobile</span>
              <b>{data.patientMobile || "-"}</b>
            </div>
            <div>
              <span>Doctor</span>
              <b>{data.doctorName || "-"}</b>
            </div>
            <div>
              <span>Department</span>
              <b>{data.doctorDept || "-"}</b>
            </div>
            <div>
              <span>Date</span>
              <b>{data.bookingDate || "-"}</b>
            </div>
            <div>
              <span>Time Slot</span>
              <b>{data.slotTime || "-"}</b>
            </div>
            <div>
              <span>Symptoms</span>
              <b>{symptoms}</b>
            </div>
            <div>
              <span>Status</span>
              <b>
                <span className="qx-badge confirmed">Active</span>
              </b>
            </div>
          </div>
        </div>
        <div className="qx-walkin-pass-note">
          Show this token at the OPD counter. The patient can use this token ID for future reference and follow-ups.
        </div>
      </div>
    </Modal>
  );
}

function RejectModal({ booking, onClose, onSubmit }) {
  const [chipIndex, setChipIndex] = useState(0);
  const [message, setMessage] = useState(MESSAGE_TEMPLATES[0]);
  return (
    <Modal
      title={`Reject token ${booking.tokenId}`}
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => onSubmit(message)}>
            Reject &amp; Notify
          </button>
        </>
      }
    >
      <p className="qx-muted" style={{ margin: "4px 0 14px" }}>
        {booking.patientName} · {booking.doctorName} · {booking.bookingDate} {booking.slotTime}
      </p>
      <div className="qx-action-form">
        <label className="qx-form-label">Message to patient</label>
        <textarea
          placeholder="Enter a custom message to the patient..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        ></textarea>
        <TemplateChips
          selected={chipIndex}
          onSelect={(i) => {
            setChipIndex(i);
            setMessage(MESSAGE_TEMPLATES[i]);
          }}
        />
      </div>
    </Modal>
  );
}

function RescheduleModal({ booking, doctors, onClose, onSubmit }) {
  const today = new Date().toISOString().split("T")[0];
  const [chipIndex, setChipIndex] = useState(0);
  const [date, setDate] = useState(booking.bookingDate || today);
  const [slot, setSlot] = useState(booking.slotTime || SLOTS[0]);
  const [message, setMessage] = useState(MESSAGE_TEMPLATES[0]);

  const slots = useMemo(() => {
    const doc = (doctors || []).find((d) => d.name === booking.doctorName);
    return doc && doc.opdSlots && doc.opdSlots.length ? doc.opdSlots : SLOTS;
  }, [doctors, booking.doctorName]);

  return (
    <Modal
      title={`Reschedule token ${booking.tokenId}`}
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="qx-btn qx-btn-sm" onClick={() => onSubmit(date, slot, message)}>
            Reschedule &amp; Notify
          </button>
        </>
      }
    >
      <p className="qx-muted" style={{ margin: "4px 0 14px" }}>
        {booking.patientName} · {booking.doctorName} · currently {booking.bookingDate} {booking.slotTime}
      </p>
      <div className="qx-action-form">
        <div className="qx-form-row">
          <div>
            <label className="qx-form-label">New date</label>
            <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="qx-form-label">New time slot</label>
            <select value={slot} onChange={(e) => setSlot(e.target.value)}>
              {slots.map((s) => (
                <option key={s} value={s} selected={s === slot}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="qx-form-label">Message to patient (custom)</label>
        <textarea
          placeholder="Optional message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        ></textarea>
        <TemplateChips
          selected={chipIndex}
          onSelect={(i) => {
            setChipIndex(i);
            setMessage(MESSAGE_TEMPLATES[i]);
          }}
        />
      </div>
    </Modal>
  );
}

function ProfileModal({ booking, onClose }) {
  const med = booking.medicalHistory || {};
  const conditions = (med.preExistingConditions || []).join(", ") || "None";
  const photo = booking.profilePhoto;
  return (
    <Modal
      title="Patient Profile"
      onClose={onClose}
      footer={
        <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="qx-flex qx-wrap qx-mb">
        {photo ? (
          <img
            src={photo}
            alt="Patient"
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div className="qx-avatar" style={{ width: 80, height: 80, fontSize: 34 }}>
            {(booking.patientName || "P").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <strong style={{ fontSize: 18 }}>{booking.patientName}</strong>
          <div className="qx-muted">{booking.patientMobile}</div>
          <div className="qx-muted">{booking.patientEmail}</div>
        </div>
      </div>
      {booking.address && (
        <div className="qx-flex qx-wrap qx-mb">
          <div className="qx-card" style={{ flex: 1, background: "#f8fafc" }}>
            <strong>Address:</strong> {booking.address}
            <br />
            <span className="qx-badge confirmed qx-mt">{formatDistance(booking.distanceKm)} from hospital</span>
          </div>
        </div>
      )}
      <div className="qx-card" style={{ background: "#f8fafc" }}>
        <h4 style={{ marginTop: 0 }}>Medical Information</h4>
        <div className="qx-grid qx-grid-2">
          <div>
            <strong>Blood Pressure:</strong> {med.bloodPressure || "Normal"}
          </div>
          <div>
            <strong>Allergies:</strong> {med.allergies || "No"}
          </div>
          <div>
            <strong>Past Surgeries:</strong> {med.pastSurgeries || "No"}
          </div>
          <div>
            <strong>Conditions:</strong> {conditions}
          </div>
          <div>
            <strong>Main Problem:</strong> {med.currentProblem || "-"}
          </div>
          <div>
            <strong>Severity:</strong> {med.severity || "Mild"} · <strong>Duration:</strong> {med.problemDuration || "-"}
          </div>
        </div>
        {med.otherNotes && (
          <div className="qx-mt">
            <strong>Notes:</strong> {med.otherNotes}
          </div>
        )}
      </div>
      <div className="qx-mt">
        <strong>Booking:</strong> {booking.tokenId} · {booking.doctorName} · {booking.bookingDate} {booking.slotTime}
        <br />
        <StatusBadge status={booking.status} />
        {NOW_SERVING.includes((booking.status || "").toUpperCase()) && typeof booking.tokensAhead === "number" && booking.tokensAhead >= 0 && (
          <span className="qx-badge neutral">
            ⏱ Est. wait ~{booking.estimatedWaitMinutes} min · {booking.tokensAhead} ahead
          </span>
        )}
        {booking.approachAlertedAt && <span className="qx-badge neutral">📱 Approaching alert sent</span>}
      </div>
    </Modal>
  );
}

function ConfirmEmergencyModal({ alert, onClose, onSubmit }) {
  const [roomNumber, setRoomNumber] = useState("");
  const [ambulanceNumber, setAmbulanceNumber] = useState("");
  const [instructions, setInstructions] = useState("");
  const roomRef = useRef(null);
  useEffect(() => {
    if (roomRef.current) roomRef.current.focus();
  }, []);

  return (
    <Modal
      title="🚨 Confirm Emergency & Assign Room"
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="qx-btn qx-btn-danger qx-btn-sm"
            onClick={() => onSubmit({ alertId: alert.alertId, roomNumber, ambulanceNumber, instructions })}
          >
            ✓ Confirm &amp; Assign
          </button>
        </>
      }
    >
      <p className="qx-muted" style={{ margin: "4px 0 14px" }}>
        Patient: <strong>{alert.patientName || "Unknown"}</strong>
        {alert.tokenId && (
          <>
            {" "}
            · Token: <strong>{alert.tokenId}</strong>
          </>
        )}
        {alert.severity && (
          <>
            {" "}
            · Severity: <strong>{alert.severityLabel || alert.severity}</strong>
          </>
        )}
      </p>
      {(alert.customAddress || alert.distanceKm != null) && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            marginBottom: 14,
            fontSize: 12,
            color: "#0369a1",
            fontWeight: 600
          }}
        >
          {alert.customAddress && <>📍 {alert.customAddress} </>}
          {alert.distanceKm != null && <>· 📏 {String(alert.distanceKm)} km </>}
          {alert.estimatedTravelMinutes != null && <>· ⏱ ~{String(alert.estimatedTravelMinutes)} min</>}
        </div>
      )}
      <div className="qx-action-form">
        <div className="qx-form-row">
          <div>
            <label className="qx-form-label">Target Room *</label>
            <select ref={roomRef} value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)}>
              <option value="" disabled>
                Select room…
              </option>
              {ROOMS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="qx-form-label">Ambulance Fleet (optional)</label>
            <select value={ambulanceNumber} onChange={(e) => setAmbulanceNumber(e.target.value)}>
              <option value="">Select ambulance…</option>
              {AMBULANCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="qx-form-label">Emergency Instructions (optional)</label>
        <select value={instructions} onChange={(e) => setInstructions(e.target.value)}>
          <option value="">Select preset instructions…</option>
          {INSTRUCTION_PRESETS.map((i) => (
            <option key={i} value={i}>
              {i.length > 60 ? i.slice(0, 60) + "…" : i}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

function DismissEmergencyModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState("False alarm — verified safe");
  return (
    <Modal
      title="Dismiss Emergency Alert"
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => onSubmit(reason)}>
            Dismiss Alert
          </button>
        </>
      }
    >
      <div className="qx-action-form">
        <label className="qx-form-label">Dismiss reason (optional)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}></textarea>
      </div>
    </Modal>
  );
}
