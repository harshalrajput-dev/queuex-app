import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { StatusBadge } from "../components/Badges.jsx";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api, API_BASE, getToken } from "../api/client.js";
import {
  estimateDistanceKm,
  generateRoutesFromAddress,
  localityNames,
  reverseGeocodeToLocality
} from "../api/location.js";
import {
  ageFromDob,
  downloadBlobPdf,
  emergencyPassPdfUrl,
  formatDateTime,
  formatDistance,
  playSosBeep,
  qrDataURL,
  verifyTokenURL
} from "../utils/helpers.js";
import { printBooking } from "../utils/printPass.js";

const ACTIVE_STATUSES = ["PENDING_ASSISTANT", "CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT"];
const CAN_DOWNLOAD = ["CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT", "COMPLETED"];
const RELATION_EMOJIS = {
  Father: "👨",
  Mother: "👩",
  Spouse: "💑",
  Son: "👦",
  Daughter: "👧",
  Brother: "🧑",
  Sister: "👧",
  Grandfather: "👴",
  Grandmother: "👵",
  Other: "👤"
};
const RELATIONS = ["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Grandfather", "Grandmother", "Other"];

function TokenPassModal({ booking, onClose }) {
  if (!booking) return null;
  const url = verifyTokenURL(booking.tokenId, booking.qrSignature);
  const qr = qrDataURL(url, 7, 3);
  const primary = booking.primarySymptom || (booking.symptoms && booking.symptoms.primary) || "";
  return (
    <Modal
      title="Appointment Pass"
      onClose={onClose}
      footer={
        <>
          <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={onClose}>
            Close
          </button>
          <button
            className="qx-btn qx-btn-success qx-btn-sm"
            onClick={() => {
              if (!printBooking(booking)) onClose();
              onClose();
            }}
          >
            🖨 Download / Print
          </button>
        </>
      }
    >
      <p className="qx-muted" style={{ margin: "4px 0 14px" }}>
        Download or print your appointment pass with QR code.
      </p>
      <div className="qx-pass" id="tokenPass">
        <div className="qx-pass-head">
          <div className="qx-pass-brand">
            <span className="qx-brand-badge">🏥</span>
            <div>
              <strong>QueueX</strong>
              <small>New Civil Hospital, Surat</small>
            </div>
          </div>
          <div className="qx-pass-token">{booking.tokenId}</div>
        </div>
        <div className="qx-pass-body">
          <div className="qx-pass-patient">
            <strong>{booking.patientName}</strong>
            <div className="qx-muted">{booking.patientMobile || ""}</div>
            <div className="qx-mt">
              <StatusBadge status={booking.status} />
            </div>
          </div>
          <div className="qx-pass-grid">
            <div>
              <span>Doctor</span>
              <b>{booking.doctorName}</b>
            </div>
            <div>
              <span>Department</span>
              <b>{booking.doctorDept || ""}</b>
            </div>
            <div>
              <span>Room</span>
              <b>{booking.roomNo || "-"}</b>
            </div>
            <div>
              <span>Date</span>
              <b>{booking.bookingDate}</b>
            </div>
            <div>
              <span>Time slot</span>
              <b>{booking.slotTime}</b>
            </div>
            <div>
              <span>Distance</span>
              {booking.address ? (
                <span className="qx-badge confirmed">{formatDistance(booking.distanceKm)} from hospital</span>
              ) : (
                <span className="qx-muted">-</span>
              )}
            </div>
          </div>
          {primary && (
            <div className="qx-pass-row">
              <span>Main symptom</span>
              <b>{primary}</b>
            </div>
          )}
        </div>
        <div className="qx-pass-foot">
          <div className="qx-pass-qr">
            <a href={url} target="_blank" rel="noopener" title="Tap to verify this token">
              {qr ? (
                <img src={qr} alt={`QR code for ${booking.tokenId}`} width="128" height="128" />
              ) : (
                <span className="qx-muted">QR unavailable</span>
              )}
            </a>
            <small>Scan or tap the QR to verify</small>
          </div>
          <div className="qx-pass-note">
            <b>Please carry this pass to the hospital.</b>
            <p className="qx-muted">Show the QR code at the OPD counter when you arrive. Arrive 15 minutes before your slot.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];
  const [bookings, setBookings] = useState([]);
  const bookingsRef = useRef([]);
  const [departments, setDepartments] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [notifications, setNotifications] = useState({ list: [], unreadCount: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [medicalHistory, setMedicalHistory] = useState(null);
  const [emergencyPass, setEmergencyPass] = useState(null);
  const [emergencyPolling, setEmergencyPolling] = useState(false);
  const seenApproaching = useRef(new Set());

  /* Booking form */
  const [bk, setBk] = useState({ dept: "", date: today, bookingFor: "self", symptom: "", address: "", severity: "Mild", duration: "Today" });
  const [doctorsForDept, setDoctorsForDept] = useState([]);
  const [selected, setSelected] = useState({ doctorId: null, slot: null });
  const [distanceKm, setDistanceKm] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [bookError, setBookError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  /* SOS */
  const [sosCooldown, setSosCooldown] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [sosForm, setSosForm] = useState({ bookingFor: "self", severity: "MODERATE", address: "", gpsStatus: "", gpsStyle: { display: "none" }, gpsInner: "", preview: "" });
  const [triageLocation, setTriageLocation] = useState({ lat: null, lng: null });
  const [sosStage, setSosStage] = useState("form"); // form | countdown | sending | sent | error
  const [sosCountdown, setSosCountdown] = useState(5);
  const [sosResult, setSosResult] = useState(null);

  /* Modal */
  const [modal, setModal] = useState(null); // {type:'family', fm} | {type:'pass', booking}
  const [fmForm, setFmForm] = useState({ name: "", age: "", relation: "Father", gender: "Male", error: "" });

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const loadTokens = useCallback(async () => {
    try {
      const res = await api("/bookings?mine=1&limit=50", { auth: true });
      const list = Array.isArray(res) ? res : [];
      setBookings(list);
      return list;
    } catch (err) {
      toast(err.message);
      return [];
    }
  }, [toast]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api("/notifications", { auth: true });
      const list = res.data.notifications || [];
      const unread = res.data.unreadCount || 0;
      for (const n of list) {
        if (n.type === "TURN_APPROACHING" && n._id && !seenApproaching.current.has(n._id)) {
          seenApproaching.current.add(n._id);
          toast(`🔔 ${n.title}: ${n.message} (Simulated SMS/WhatsApp alert also sent)`);
        }
      }
      setNotifications({ list, unreadCount: unread });
    } catch (err) {
      /* silent */
    }
  }, [toast]);

  const loadMedicalHistory = useCallback(async () => {
    try {
      const res = await api("/auth/me", { auth: true });
      setMedicalHistory(res.data.medicalHistory || null);
    } catch (err) {
      /* silent */
    }
  }, []);

  const loadEmergencyPass = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api(`/emergency/check?email=${encodeURIComponent(user.email)}`, { auth: true });
      if (res.data && res.data.confirmedAlert) {
        setEmergencyPass(res.data.confirmedAlert);
        setEmergencyPolling(false);
      } else if (res.data && res.data.hasActive) {
        setEmergencyPolling(true);
      }
    } catch (err) {
      /* silent */
    }
  }, [user]);

  const checkSosCooldown = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api(`/emergency/cooldown?email=${encodeURIComponent(user.email)}`, { auth: true });
      const data = res.data || res;
      if (data.onCooldown) setSosCooldown(data);
      else setSosCooldown(null);
    } catch (err) {
      setSosCooldown(null);
    }
  }, [user]);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await api("/departments");
      setDepartments(res.data || []);
    } catch (err) {
      setBookError(err.message);
    }
  }, []);

  const loadFamilyMembers = useCallback(async () => {
    try {
      const res = await api("/auth/family-members", { auth: true });
      setFamilyMembers(res.data || []);
    } catch (err) {
      setFamilyMembers([]);
    }
  }, []);

  const refreshLoop = useCallback(async () => {
    const before = new Map(bookingsRef.current.map((b) => [b.tokenId, b.status]));
    await loadTokens();
    bookingsRef.current.forEach((b) => {
      const prev = before.get(b.tokenId);
      if (prev && prev !== b.status) {
        if (b.status === "CONFIRMED") {
          toast(`🎉 Your token ${b.tokenId} is confirmed! You can now download your token pass.`);
        } else {
          toast(`Your token ${b.tokenId} status updated to ${b.status.replace(/_/g, " ")}.`);
        }
      }
    });
    await loadNotifications();
    await loadEmergencyPass();
  }, [loadTokens, loadNotifications, loadEmergencyPass, toast]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      loadDepartments(),
      loadTokens(),
      loadNotifications(),
      loadMedicalHistory(),
      loadEmergencyPass(),
      checkSosCooldown(),
      loadFamilyMembers()
    ]);
    const int = setInterval(refreshLoop, 5000);
    return () => clearInterval(int);
  }, [user, loadDepartments, loadTokens, loadNotifications, loadMedicalHistory, loadEmergencyPass, checkSosCooldown, loadFamilyMembers, refreshLoop]);

  /* Realtime SSE */
  useEffect(() => {
    if (!window.EventSource || !user) return;
    const es = new EventSource(`${API_BASE}/queue-display/events`);
    const onConfirm = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.patientEmail === user.email) {
          setEmergencyPass({
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
          setEmergencyPolling(false);
          toast(`🚨 Your emergency has been confirmed! Assigned to Room ${data.roomNumber || "?"}. Download your pass.`);
        }
      } catch (err) {
        /* silent */
      }
    };
    es.addEventListener("emergency.confirmed", onConfirm);
    es.onerror = () => {};
    return () => es.close();
  }, [user, toast]);

  /* Emergency polling */
  useEffect(() => {
    if (!emergencyPolling) return;
    const int = setInterval(loadEmergencyPass, 3000);
    return () => clearInterval(int);
  }, [emergencyPolling, loadEmergencyPass]);

  /* Load doctors for selected department */
  useEffect(() => {
    if (!bk.dept) {
      setDoctorsForDept([]);
      setSelected({ doctorId: null, slot: null });
      return;
    }
    setSelected({ doctorId: null, slot: null });
    api(`/doctors?department=${encodeURIComponent(bk.dept)}`)
      .then((res) => setDoctorsForDept(res.data || []))
      .catch((err) => setBookError(err.message));
  }, [bk.dept]);

  /* Distance preview + routes */
  useEffect(() => {
    const val = bk.address.trim();
    if (!val) {
      setDistanceKm(null);
      setRoutes(null);
      return;
    }
    setDistanceKm(estimateDistanceKm(val));
    setRoutes(generateRoutesFromAddress(val));
  }, [bk.address]);

  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast("Geolocation is not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const areaName = reverseGeocodeToLocality(latitude, longitude);
        setBk((p) => ({ ...p, address: areaName + ", Surat" }));
        setGpsLoading(false);
        toast(`Location detected: ${areaName}, Surat`);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) toast("Location access denied. Please allow location permissions.");
        else toast("Unable to get location. Please enter address manually.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const submitBooking = async () => {
    setBookError("");
    if (!selected.doctorId || !selected.slot) {
      setBookError("Please select a doctor and time slot.");
      return;
    }
    const doc = doctorsForDept.find((d) => d._id === selected.doctorId);
    const payload = {
      doctorId: doc._id,
      doctorName: doc.name,
      doctorDept: doc.department,
      slotTime: selected.slot,
      bookingDate: bk.date,
      address: bk.address.trim(),
      symptoms: { primary: bk.symptom.trim(), severity: bk.severity, duration: bk.duration }
    };
    if (bk.bookingFor && bk.bookingFor !== "self") {
      const fm = familyMembers.find((f) => f._id === bk.bookingFor);
      if (fm) {
        payload.bookingFor = fm._id;
        payload.familyMemberId = fm._id;
        payload.patientName = `${user.name} → ${fm.name}`;
      }
    }
    try {
      const res = await api("/bookings", { method: "POST", auth: true, body: payload });
      toast(`Token ${res.tokenId} booked. Waiting for hospital confirmation.`);
      await Promise.all([loadTokens(), loadNotifications()]);
      setSelected({ doctorId: null, slot: null });
      setBk((p) => ({ ...p, symptom: "" }));
    } catch (err) {
      setBookError(err.message);
    }
  };

  const cancelToken = async (tokenId) => {
    if (!window.confirm("Cancel this token?")) return;
    const reason = window.prompt("Reason for cancellation (optional):", "") || "";
    try {
      await api(`/bookings/${tokenId}`, { method: "PUT", auth: true, body: { status: "CANCELLED", reason } });
      toast("Token cancelled.");
      await Promise.all([loadTokens(), loadNotifications()]);
    } catch (err) {
      toast(err.message);
    }
  };

  const markAllRead = async () => {
    try {
      await api("/notifications/read-all", { method: "PUT", auth: true });
      await loadNotifications();
    } catch (err) {
      toast(err.message);
    }
  };

  /* --- Family member modal --- */
  const openFamilyModal = (fm = null) => {
    setFmForm({
      name: fm ? fm.name : "",
      age: fm ? String(fm.age) : "",
      relation: fm ? fm.relation : "Father",
      gender: fm ? fm.gender : "Male",
      error: ""
    });
    setModal({ type: "family", fm });
  };

  const saveFamilyMember = async () => {
    if (!fmForm.name.trim() || fmForm.age === "") {
      setFmForm((p) => ({ ...p, error: "Name and age are required." }));
      return;
    }
    const body = { name: fmForm.name.trim(), age: Number(fmForm.age), relation: fmForm.relation, gender: fmForm.gender };
    try {
      if (modal.fm) {
        await api(`/auth/family-members/${modal.fm._id}`, { method: "PUT", auth: true, body });
        toast("Family member updated.");
      } else {
        await api("/auth/family-members", { method: "POST", auth: true, body });
        toast("Family member added.");
      }
      setModal(null);
      await loadFamilyMembers();
    } catch (err) {
      setFmForm((p) => ({ ...p, error: err.message }));
    }
  };

  const deleteFamilyMember = async (fm) => {
    if (!window.confirm(`Remove ${fm.name} from your family members?`)) return;
    try {
      await api(`/auth/family-members/${fm._id}`, { method: "DELETE", auth: true });
      toast("Family member removed.");
      await loadFamilyMembers();
    } catch (err) {
      toast(err.message);
    }
  };

  /* --- SOS --- */
  const closeSos = () => {
    setSosOpen(false);
    setSosStage("form");
    setSosCountdown(5);
    setSosResult(null);
    setSosForm((p) => ({ ...p, address: "", gpsStatus: "", gpsStyle: { display: "none" }, preview: "" }));
  };

  useEffect(() => {
    if (sosStage !== "countdown") return;
    setSosCountdown(5);
    playSosBeep();
    const int = setInterval(() => {
      setSosCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(int);
          fireSos();
          return 0;
        }
        if (prev <= 3) playSosBeep();
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(int);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sosStage]);

  const fireSos = async () => {
    setSosStage("sending");
    const active = bookings.find((b) => ACTIVE_STATUSES.includes(b.status));
    const payload = {
      tokenId: active ? active.tokenId : "",
      severity: sosForm.severity,
      customAddress: sosForm.address
    };
    if (triageLocation.lat != null) {
      payload.latitude = triageLocation.lat;
      payload.longitude = triageLocation.lng;
    }
    if (sosForm.bookingFor && sosForm.bookingFor !== "self") {
      const fm = familyMembers.find((f) => f._id === sosForm.bookingFor);
      if (fm) {
        payload.alertFor = fm._id;
        payload.familyMemberId = fm._id;
        payload.patientName = `${user.name} → ${fm.name}`;
      }
    }
    try {
      const res = await api("/emergency/trigger", { method: "POST", auth: true, body: payload });
      setSosResult({ sent: true, data: res });
      setSosStage("sent");
      toast("🚨 Emergency SOS sent. Hospital staff notified.");
    } catch (err) {
      setSosResult({ sent: false, error: err.message });
      setSosStage("error");
    }
  };

  const fetchTriageLocation = () => {
    if (!navigator.geolocation) {
      setSosForm((p) => ({ ...p, gpsStatus: "Geolocation not supported by your browser.", gpsStyle: { display: "block" }, gpsInner: "" }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setTriageLocation({ lat: latitude, lng: longitude });
        const areaName = reverseGeocodeToLocality(latitude, longitude);
        const addr = areaName + ", Surat";
        setSosForm((p) => ({
          ...p,
          address: p.address || addr,
          gpsStatus: "✅ GPS locked",
          gpsInner: `📍 ${addr}`,
          gpsStyle: { display: "block" }
        }));
        toast(`Location detected: ${areaName}, Surat`);
      },
      (err) => {
        setSosForm((p) => ({
          ...p,
          gpsStatus: err.code === 1 ? "Location access denied. Please enter address manually." : "Unable to get GPS. Enter address manually.",
          gpsStyle: { display: "block" },
          gpsInner: ""
        }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const sosEta = (() => {
    const addr = sosForm.address.trim();
    if (!addr && triageLocation.lat == null) return null;
    const dist = estimateDistanceKm(addr);
    const eta = Math.max(3, Math.round((dist / 25) * 60));
    return { dist, eta };
  })();

  const currentToken = bookings.find((b) => ACTIVE_STATUSES.includes(b.status)) || null;

  const downloadEmergencyPass = (alertId) => {
    toast("Generating emergency pass PDF...");
    downloadBlobPdf(`emergency-pass-${alertId}.pdf`, emergencyPassPdfUrl(alertId), true)
      .then(() => toast("Emergency pass downloaded successfully."))
      .catch((err) => toast(err.message || "Failed to download emergency pass."));
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const med = medicalHistory;
  const medPresent = med && (med.currentProblem || (med.preExistingConditions || []).length > 0);

  return (
    <div>
      <Topbar brandSmall="Patient Dashboard">
        <Link to="/" className="qx-btn qx-btn-outline qx-btn-sm">
          Home
        </Link>
        <Link to="/queue" className="qx-btn qx-btn-warning qx-btn-sm">
          Live Queue
        </Link>
        <button className="qx-btn qx-btn-outline qx-btn-sm" id="notifBtn" onClick={() => setNotifOpen((o) => !o)}>
          🔔 Notifications{" "}
          {notifications.unreadCount > 0 && (
            <span id="notifBadge" className="qx-badge rejected">
              {notifications.unreadCount}
            </span>
          )}
        </button>
        <span className="qx-nav-user">
          {user && user.profilePhoto ? (
            <img src={user.profilePhoto} className="qx-avatar" alt="" />
          ) : (
            <span className="qx-avatar qx-avatar-initial">{(user ? user.name : "U").charAt(0).toUpperCase()}</span>
          )}
          <span>{user ? user.name : ""}</span>
        </span>
        <button className="qx-btn qx-btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </Topbar>

      <main className="container">
        <div className="qx-grid qx-grid-dash">
          {/* LEFT */}
          <div>
            <div className="qx-card qx-mb">
              <div className="qx-center qx-mb">
                {user && user.profilePhoto ? (
                  <img src={user.profilePhoto} className="qx-avatar" style={{ width: 90, height: 90, fontSize: 36 }} alt="Profile photo" />
                ) : (
                  <div className="qx-avatar qx-avatar-initial" style={{ width: 90, height: 90, fontSize: 36 }}>
                    {(user ? user.name : "P").charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 style={{ marginBottom: 0 }}>{user ? user.name : "Patient"}</h3>
                <div className="qx-muted">PATIENT</div>
              </div>
              <table className="qx-profile-table">
                <tbody>
                  <tr><td className="qx-muted">Email</td><td>{user ? user.email : ""}</td></tr>
                  <tr><td className="qx-muted">Mobile</td><td>{user ? user.mobile : ""}</td></tr>
                  <tr><td className="qx-muted">Blood Group</td><td>{user ? user.bloodGroup || "-" : "-"}</td></tr>
                  <tr><td className="qx-muted">Age</td><td>{user ? ageFromDob(user.dob) || "-" : "-"}</td></tr>
                  <tr><td className="qx-muted">City</td><td>{user ? user.city || "-" : "-"}</td></tr>
                </tbody>
              </table>
              <Link to="/login" onClick={(e) => { e.preventDefault(); handleLogout(); }} className="qx-btn qx-btn-danger qx-btn-sm w100 qx-mt">
                Logout
              </Link>
            </div>

            <div className="qx-card qx-mb" id="sosCard">
              <button type="button" className="qx-btn-sos w100" id="sosBtn" disabled={!!sosCooldown} onClick={() => { setSosOpen(true); setSosStage("form"); }}>
                <span className="sos-icon">🚨</span>
                <span className="sos-text">Emergency SOS</span>
              </button>
              <div className="qx-sos-hint">Tap only for real medical emergencies</div>
              {sosCooldown && (
                <div className="qx-sos-cooldown-info" id="sosCooldownInfo">
                  🔒 Emergency SOS locked for {Math.ceil((sosCooldown.remainingMs || 0) / (1000 * 60 * 60 * 24))} more day(s). Unlocks on{" "}
                  {new Date(sosCooldown.coolDownUntil).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.
                </div>
              )}
            </div>

            {emergencyPass && (
              <div className="qx-card qx-mb" id="emergencyPassCard">
                <div className="qx-emergency-pass-header">
                  <span>🚨</span>
                  <h4>Emergency Confirmed</h4>
                </div>
                <div className="qx-emergency-pass-details">
                  <div className="qx-emergency-pass-row">
                    <div className="qx-emergency-pass-field">
                      <span>Token</span>
                      <strong>{emergencyPass.tokenId || "N/A"}</strong>
                    </div>
                    <div className="qx-emergency-pass-field">
                      <span>Room</span>
                      <strong>Room {emergencyPass.roomNumber || "-"}</strong>
                    </div>
                  </div>
                  <div className="qx-emergency-pass-row">
                    <div className="qx-emergency-pass-field">
                      <span>Severity</span>
                      <strong>
                        <span className={`qx-severity-badge ${(emergencyPass.severity || "MODERATE").toLowerCase()}`}>
                          {emergencyPass.severityLabel || (emergencyPass.severity || "MODERATE").replace(/_/g, " ")}
                        </span>
                      </strong>
                    </div>
                    <div className="qx-emergency-pass-field">
                      <span>Confirmed At</span>
                      <strong>{emergencyPass.confirmedAt ? formatDateTime(emergencyPass.confirmedAt) : formatDateTime(new Date())}</strong>
                    </div>
                  </div>
                  {emergencyPass.customAddress && (
                    <div className="qx-emergency-pass-row">
                      <div className="qx-emergency-pass-field" style={{ gridColumn: "1/-1" }}>
                        <span>Patient Address</span>
                        <strong>{emergencyPass.customAddress}</strong>
                      </div>
                    </div>
                  )}
                  <div className="qx-emergency-pass-row">
                    {emergencyPass.distanceKm != null && (
                      <div className="qx-emergency-pass-field">
                        <span>Distance</span>
                        <strong>{emergencyPass.distanceKm} km</strong>
                      </div>
                    )}
                    {emergencyPass.estimatedTravelMinutes != null && (
                      <div className="qx-emergency-pass-field">
                        <span>Est. Travel Time</span>
                        <strong>~{emergencyPass.estimatedTravelMinutes} min</strong>
                      </div>
                    )}
                  </div>
                  {emergencyPass.ambulanceNumber && (
                    <div className="qx-emergency-pass-row">
                      <div className="qx-emergency-pass-field">
                        <span>Ambulance</span>
                        <strong>{emergencyPass.ambulanceNumber}</strong>
                      </div>
                    </div>
                  )}
                  {emergencyPass.instructions && (
                    <div className="qx-emergency-pass-instructions">
                      <span>Instructions</span>
                      <strong>{emergencyPass.instructions}</strong>
                    </div>
                  )}
                </div>
                <div className="qx-emergency-pass-actions">
                  <button
                    className="qx-btn qx-btn-success qx-btn-sm w100"
                    onClick={() => downloadEmergencyPass(emergencyPass.alertId)}
                  >
                    ⬇ Download Emergency Pass (PDF)
                  </button>
                  <div className="qx-emergency-pass-note">
                    Show this pass at <strong>Room {emergencyPass.roomNumber || "..."}</strong> to begin treatment immediately.
                  </div>
                </div>
              </div>
            )}

            {notifOpen && (
              <div className="qx-card qx-mb" id="notifPanel">
                <div className="qx-flex" style={{ justifyContent: "space-between" }}>
                  <h4>Notifications</h4>
                  <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={markAllRead}>
                    Mark all read
                  </button>
                </div>
                <div id="notifList">
                  {notifications.list.length ? (
                    notifications.list.map((n) => (
                      <div key={n._id} style={{ padding: "8px 0", borderBottom: "1px solid var(--qx-border)", ...(n.read ? { opacity: 0.7 } : { fontWeight: 700 }) }}>
                        <div>{n.title}</div>
                        <div className="qx-muted">{n.message}</div>
                        <div className="last-updated">{formatDateTime(n.createdAt)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="qx-muted">No notifications.</div>
                  )}
                </div>
              </div>
            )}

            <div className="qx-card qx-mb" id="familyMembersCard">
              <div className="qx-flex" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>👨‍👩‍👧 My Family Members</h4>
                <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => openFamilyModal()}>
                  + Add
                </button>
              </div>
              <div id="familyMembersList">
                {familyMembers.length ? (
                  familyMembers.map((fm) => (
                    <div className="qx-family-member-row" key={fm._id}>
                      <div className="qx-family-member-info">
                        <span className="qx-family-member-avatar">{RELATION_EMOJIS[fm.relation] || "👤"}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{fm.name}</div>
                          <div className="qx-muted" style={{ fontSize: 12 }}>
                            {fm.relation} · {fm.age} yrs · {fm.gender}
                          </div>
                        </div>
                      </div>
                      <div className="qx-family-member-actions">
                        <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => openFamilyModal(fm)}>
                          Edit
                        </button>
                        <button className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => deleteFamilyMember(fm)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="qx-muted" style={{ fontSize: 13 }}>
                    No family members added yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div>
            <div className="qx-card qx-mb" id="currentTokenCard">
              <h3>My Current Token</h3>
              <div id="currentTokenBox">
                {!currentToken ? (
                  <div className="qx-muted">No active token. Book a token from the form below.</div>
                ) : (
                  <div>
                    <div className="qx-flex qx-wrap qx-mt" style={{ justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: "var(--qx-blue-dark)" }}>{currentToken.tokenId}</div>
                        <StatusBadge status={currentToken.status} />
                        <div className="qx-muted">
                          {{
                            PENDING_ASSISTANT: "Waiting for hospital confirmation.",
                            CONFIRMED: "Token confirmed. Your appointment pass with QR code is ready to download.",
                            PATIENT_ARRIVED: "You have arrived. Please wait for your turn.",
                            IN_TREATMENT: "Treatment in progress."
                          }[currentToken.status]}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div>
                          <strong>{currentToken.doctorName}</strong>
                        </div>
                        <div className="qx-muted">{currentToken.doctorDept || ""}</div>
                        <div className="qx-muted">
                          {currentToken.bookingDate} · {currentToken.slotTime}
                        </div>
                        <div className="qx-muted">Room: {currentToken.roomNo || "-"}</div>
                      </div>
                    </div>
                    {currentToken.address && (
                      <div className="qx-flex qx-wrap qx-mt">
                        <span className="qx-muted">📍 {currentToken.address}</span>
                        <span className="qx-badge confirmed">{formatDistance(currentToken.distanceKm)} from hospital</span>
                      </div>
                    )}
                    <div className="qx-flex qx-wrap qx-mt">
                      {["CONFIRMED", "PATIENT_ARRIVED", "PENDING_ASSISTANT"].includes(currentToken.status) &&
                        typeof currentToken.tokensAhead === "number" &&
                        currentToken.tokensAhead >= 0 && (
                          <>
                            <span className="qx-badge neutral">⏱ Est. wait ~{currentToken.estimatedWaitMinutes} min</span>
                            <span className="qx-badge arrived">
                              {currentToken.tokensAhead} {currentToken.tokensAhead === 1 ? "token" : "tokens"} ahead
                            </span>
                          </>
                        )}
                      {currentToken.status === "IN_TREATMENT" && <span className="qx-badge confirmed">In treatment now</span>}
                    </div>
                    <div className="qx-flex qx-wrap qx-mt">
                      {CAN_DOWNLOAD.includes(currentToken.status) && (
                        <button className="qx-btn qx-btn-success qx-btn-sm" onClick={() => setModal({ type: "pass", booking: currentToken })}>
                          ⬇ Download Token
                        </button>
                      )}
                      <button className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => cancelToken(currentToken.tokenId)}>
                        Cancel this token
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="qx-card qx-mb" id="bookTokenCard">
              <h3>Book Token</h3>
              {bookError && <div className="qx-alert qx-alert-danger">{bookError}</div>}
              <div className="qx-grid qx-grid-2">
                <div className="qx-field">
                  <label htmlFor="bkDepartment">Department</label>
                  <select id="bkDepartment" value={bk.dept} onChange={(e) => setBk((p) => ({ ...p, dept: e.target.value }))}>
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="qx-field">
                  <label htmlFor="bkDate">Appointment Date</label>
                  <input type="date" id="bkDate" min={today} value={bk.date} onChange={(e) => setBk((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="qx-field">
                <label htmlFor="bkBookingFor">Booking For</label>
                <select id="bkBookingFor" value={bk.bookingFor} onChange={(e) => setBk((p) => ({ ...p, bookingFor: e.target.value }))}>
                  <option value="self">Self ({user ? user.name : ""})</option>
                  {familyMembers.map((fm) => (
                    <option key={fm._id} value={fm._id}>
                      {fm.name} ({fm.relation})
                    </option>
                  ))}
                </select>
              </div>
              <div id="doctorPicker" className="qx-grid qx-grid-3">
                {!bk.dept && <div className="qx-muted" style={{ fontSize: 13 }}>Select a department to view doctors.</div>}
                {bk.dept && !doctorsForDept.length && <div className="qx-alert qx-alert-info">No doctors in this department.</div>}
                {doctorsForDept.map((doc) => {
                  const unavailable = doc.status && doc.status !== "AVAILABLE";
                  return (
                    <div
                      className="qx-card"
                      key={doc._id}
                      style={{ borderColor: selected.doctorId === doc._id ? "var(--qx-blue)" : "var(--qx-border)" }}
                    >
                      <div className="qx-doc-top">
                        <div className={`qx-doc-avatar qx-doc-avatar-sm ${unavailable ? "off" : ""}`}>
                          {doc.photo ? (
                            <img src={doc.photo} alt={doc.name} loading="lazy" />
                          ) : (
                            <img src="/img/staff-default.svg" alt={doc.name} loading="lazy" />
                          )}
                        </div>
                        <div>
                          <strong>{doc.name}</strong>
                          <div className="qx-muted">{doc.qualification || ""}</div>
                          <div className="qx-muted">Room: {doc.room || "-"}</div>
                        </div>
                      </div>
                      <div className="qx-mt">
                        {(doc.opdSlots || []).map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            className={`qx-btn qx-btn-outline qx-btn-sm qx-mb ${selected.slot === slot && selected.doctorId === doc._id ? "qx-slot-selected" : ""}`}
                            style={{ marginRight: 6, ...(selected.slot === slot && selected.doctorId === doc._id ? { background: "var(--qx-blue)", color: "#fff" } : {}) }}
                            disabled={unavailable}
                            onClick={() => setSelected({ doctorId: doc._id, slot })}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                      {unavailable && <div className="qx-badge rejected qx-mt">{doc.status.replace(/_/g, " ")}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="qx-field qx-mt">
                <label>Main symptom</label>
                <input type="text" placeholder="e.g. fever, cough, chest pain" value={bk.symptom} onChange={(e) => setBk((p) => ({ ...p, symptom: e.target.value }))} />
              </div>
              <div className="qx-field">
                <label htmlFor="bkAddress">Home Address (for travel distance)</label>
                <input type="text" id="bkAddress" list="suratAreas" placeholder="e.g. Adajan, Mota Varachha or full address, Surat" value={bk.address} onChange={(e) => setBk((p) => ({ ...p, address: e.target.value }))} />
                <datalist id="suratAreas">
                  {localityNames().map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
                <button type="button" className="qx-btn qx-btn-gps qx-btn-sm qx-mt" onClick={fetchCurrentLocation} disabled={gpsLoading}>
                  <span className="gps-icon">{gpsLoading ? "⏳" : "📍"}</span> Get Current Location
                  {gpsLoading && <span className="gps-spinner"></span>}
                </button>
                {distanceKm != null && (
                  <div className="est-banner qx-mt" style={{ marginBottom: 0 }}>
                    <span className="qx-badge confirmed">📏 {distanceKm} km from New Civil Hospital, Surat</span>
                  </div>
                )}
              </div>
              {routes && (
                <div className="qx-hide qx-mt" style={{ display: "block" }}>
                  <h4 style={{ marginBottom: 10 }}>🚗 Routes to New Civil Hospital, Surat</h4>
                  <div className="qx-route-table-wrap">
                    <table className="qx-route-table">
                      <thead>
                        <tr>
                          <th>Route</th>
                          <th>Distance</th>
                          <th>Traffic</th>
                          <th>Est. Bike Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routes.map((r) => (
                          <tr key={r.id} className={r.best ? "qx-route-best" : ""}>
                            <td>
                              <div className="qx-route-name">
                                <span className="qx-route-icon">{r.icon}</span>
                                <div>
                                  <strong>{r.name}</strong>
                                  <div className="qx-route-via">{r.via}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="qx-route-dist">{r.distance} km</span>
                            </td>
                            <td>
                              <span className={`qx-traffic-badge ${r.trafficCss}`}>
                                {r.trafficEmoji} {r.trafficLabel}
                              </span>
                            </td>
                            <td>
                              <span className="qx-route-time">{r.minutes} min</span>
                              {r.best && <span className="qx-badge qx-badge-best">⭐ Best Route</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="qx-grid qx-grid-2">
                <div className="qx-field">
                  <label>Severity</label>
                  <select value={bk.severity} onChange={(e) => setBk((p) => ({ ...p, severity: e.target.value }))}>
                    <option>Mild</option>
                    <option>Moderate</option>
                    <option>Severe</option>
                  </select>
                </div>
                <div className="qx-field">
                  <label>Duration</label>
                  <select value={bk.duration} onChange={(e) => setBk((p) => ({ ...p, duration: e.target.value }))}>
                    <option>Today</option>
                    <option>2-3 Days</option>
                    <option>1 Week</option>
                    <option>More than 1 Week</option>
                  </select>
                </div>
              </div>
              <button className="qx-btn qx-btn-success w100" onClick={submitBooking}>
                Submit Booking Request
              </button>
            </div>

            <div className="qx-card qx-mb">
              <h3>My Tokens &amp; History</h3>
              <div className="qx-table-wrap">
                <table className="qx-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Doctor / Dept</th>
                      <th>Date &amp; Slot</th>
                      <th>Distance</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="tokensTable">
                    {bookings.length ? (
                      bookings.map((b) => (
                        <tr key={b._id}>
                          <td>
                            <strong>{b.tokenId}</strong>
                          </td>
                          <td>
                            {b.doctorName}
                            <br />
                            <span className="qx-muted">{b.doctorDept || ""}</span>
                          </td>
                          <td>
                            {b.bookingDate}
                            <br />
                            <span className="qx-muted">{b.slotTime}</span>
                          </td>
                          <td>{b.address ? <span className="qx-badge confirmed">{formatDistance(b.distanceKm)}</span> : <span className="qx-muted">-</span>}</td>
                          <td>
                            <StatusBadge status={b.status} />
                            {b.status === "REJECTED" && b.rejectionReason && (
                              <div className="qx-muted" style={{ marginTop: 4 }}>
                                {b.rejectionReason}
                              </div>
                            )}
                          </td>
                          <td>
                            {CAN_DOWNLOAD.includes(b.status) && (
                              <button className="qx-btn qx-btn-success qx-btn-sm" onClick={() => setModal({ type: "pass", booking: b })}>
                                ⬇ Download Token
                              </button>
                            )}
                            {["PENDING_ASSISTANT", "CONFIRMED"].includes(b.status) && (
                              <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => cancelToken(b.tokenId)}>
                                Cancel
                              </button>
                            )}
                            {![...CAN_DOWNLOAD, "PENDING_ASSISTANT"].includes(b.status) && <span className="qx-muted">-</span>}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="qx-muted qx-center">
                          No tokens booked yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="qx-card qx-mb">
              <h3>Medical History</h3>
              <div id="medicalHistoryBox">
                {medPresent ? (
                  <div>
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
                        <strong>Existing Conditions:</strong> {(med.preExistingConditions || []).join(", ") || "None"}
                      </div>
                      <div>
                        <strong>Main Problem:</strong> {med.currentProblem || "-"}
                      </div>
                      <div>
                        <strong>Duration:</strong> {med.problemDuration || "-"} · <strong>Severity:</strong> {med.severity || "Mild"}
                      </div>
                    </div>
                    {med.otherNotes && (
                      <div className="qx-mt">
                        <strong>Notes:</strong> {med.otherNotes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="qx-muted">No medical history recorded.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Family member modal */}
      {modal && modal.type === "family" && (
        <Modal
          title={modal.fm ? "Edit Family Member" : "Add Family Member"}
          onClose={() => setModal(null)}
          footer={
            <>
              <button
                className="qx-btn qx-btn-sm"
                style={{ background: "var(--qx-blue)", color: "#fff" }}
                onClick={saveFamilyMember}
              >
                {modal.fm ? "Save Changes" : "Add Family Member"}
              </button>
            </>
          }
        >
          <div className="qx-grid qx-grid-2">
            <div className="qx-field">
              <label>Name *</label>
              <input type="text" placeholder="Full name" value={fmForm.name} onChange={(e) => setFmForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="qx-field">
              <label>Age *</label>
              <input type="number" min="0" max="120" placeholder="Age" value={fmForm.age} onChange={(e) => setFmForm((p) => ({ ...p, age: e.target.value }))} />
            </div>
            <div className="qx-field">
              <label>Relation *</label>
              <select value={fmForm.relation} onChange={(e) => setFmForm((p) => ({ ...p, relation: e.target.value }))}>
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="qx-field">
              <label>Gender *</label>
              <select value={fmForm.gender} onChange={(e) => setFmForm((p) => ({ ...p, gender: e.target.value }))}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          {fmForm.error && <div className="qx-alert qx-alert-danger qx-mt">{fmForm.error}</div>}
        </Modal>
      )}

      {/* Token pass modal */}
      {modal && modal.type === "pass" && (
        <TokenPassModal booking={modal.booking} onClose={() => setModal(null)} />
      )}

      {/* SOS modal */}
      {sosOpen && (
        <div className="qx-sos-backdrop" style={{ display: "flex" }}>
          <div className="qx-sos-modal qx-sos-triage">
            <div className="qx-sos-modal-header">
              <span className="qx-sos-modal-icon">🚨</span>
              <h3 id="sosModalTitle">
                {sosStage === "sent" ? "✅ SOS Sent" : sosStage === "error" ? "❌ Failed to Send" : sosStage === "sending" ? "🚨 Sending SOS..." : sosStage === "countdown" ? "Emergency Triage" : "Emergency Triage"}
              </h3>
            </div>
            <div className="qx-sos-modal-body">
              {sosStage === "form" && (
                <div className="qx-triage-form">
                  <div className="qx-triage-section">
                    <div className="qx-triage-section-title">Emergency For</div>
                    <div className="qx-field" style={{ marginBottom: 12 }}>
                      <select value={sosForm.bookingFor} onChange={(e) => setSosForm((p) => ({ ...p, bookingFor: e.target.value }))}>
                        <option value="self">Self</option>
                        {familyMembers.map((fm) => (
                          <option key={fm._id} value={fm._id}>
                            {fm.name} ({fm.relation})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="qx-triage-section">
                    <div className="qx-triage-section-title">Severity Level *</div>
                    <div className="qx-triage-severity-options">
                      {[
                        { value: "MODERATE", label: "Moderate / Stable", desc: "Non-life-threatening, needs prompt attention", cls: "severity-moderate" },
                        { value: "SERIOUS", label: "Serious / Urgent", desc: "Significant risk, requires urgent care", cls: "severity-serious" },
                        { value: "CRITICAL", label: "Critical / Severe", desc: "Life-threatening, immediate intervention needed", cls: "severity-critical" }
                      ].map((opt) => (
                        <label key={opt.value} className={`qx-triage-severity-option ${opt.cls} ${sosForm.severity === opt.value ? "selected" : ""}`}>
                          <input
                            type="radio"
                            name="triageSeverity"
                            value={opt.value}
                            checked={sosForm.severity === opt.value}
                            onChange={() => setSosForm((p) => ({ ...p, severity: opt.value }))}
                          />
                          <div>
                            <div className="qx-triage-severity-label">{opt.label}</div>
                            <div className="qx-triage-severity-desc">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="qx-triage-section">
                    <div className="qx-triage-section-title">Your Location</div>
                    <div className="qx-triage-location-row">
                      <input
                        type="text"
                        placeholder="Custom address / location (optional)"
                        value={sosForm.address}
                        onChange={(e) => setSosForm((p) => ({ ...p, address: e.target.value }))}
                      />
                      <button type="button" className="qx-triage-gps-btn" onClick={fetchTriageLocation}>
                        📍 GPS
                      </button>
                    </div>
                    {sosForm.gpsStyle.display !== "none" && (
                      <div className="qx-triage-gps-status">
                        {sosForm.gpsStatus} {sosForm.gpsInner && `: ${sosForm.gpsInner}`}
                      </div>
                    )}
                    {sosEta && (
                      <div className="qx-triage-preview">
                        <span>
                          📏 <strong>{sosEta.dist} km</strong> from hospital
                        </span>
                        <span>
                          ⏱ ~<strong>{sosEta.eta} min</strong> travel time
                        </span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "#64748b", margin: "8px 0 0" }}>
                    Hospital staff will be immediately alerted with your location and severity.
                  </p>
                </div>
              )}

              {sosStage === "countdown" && (
                <div className="qx-sos-countdown-wrap">
                  <div className="qx-sos-countdown-ring">
                    <svg viewBox="0 0 100 100">
                      <circle className="qx-sos-ring-bg" cx="50" cy="50" r="44" />
                      <circle
                        className="qx-sos-ring-progress"
                        cx="50"
                        cy="50"
                        r="44"
                        style={{ strokeDasharray: 2 * Math.PI * 44, strokeDashoffset: 2 * Math.PI * 44 * (1 - sosCountdown / 5) }}
                      />
                    </svg>
                    <span className="qx-sos-countdown-num">{sosCountdown}</span>
                  </div>
                  <p className="qx-sos-countdown-label">
                    Sending SOS in <strong>{sosCountdown} seconds</strong>...
                  </p>
                  <p className="qx-sos-countdown-sub">Tap "Cancel" to abort</p>
                </div>
              )}

              {sosStage === "sending" && (
                <div className="qx-sos-sending">
                  <div className="qx-spinner"></div>
                  <p>Alerting hospital staff...</p>
                </div>
              )}

              {sosStage === "sent" && sosResult && (
                <div className="qx-sos-sent">
                  <div className="qx-sos-sent-icon">✅</div>
                  <p>
                    <strong>Emergency alert sent successfully.</strong>
                  </p>
                  <p className="qx-muted">Hospital staff has been notified. Please stay where you are if possible.</p>
                  <div style={{ marginTop: 12, textAlign: "left" }}>
                    <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                      <strong>Severity:</strong> {sosResult.data.severityLabel || sosForm.severity}
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>
                      <strong>Distance:</strong> {sosResult.data.distanceKm != null ? sosResult.data.distanceKm + " km" : "Calculating..."}
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>
                      <strong>Est. Travel:</strong> {sosResult.data.estimatedTravelMinutes != null ? "~" + sosResult.data.estimatedTravelMinutes + " min" : "Calculating..."}
                    </div>
                  </div>
                  <p className="qx-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    {sosResult.data.message || ""}
                  </p>
                </div>
              )}

              {sosStage === "error" && sosResult && (
                <div className="qx-sos-error">
                  <p>
                    <strong>Could not send emergency alert.</strong>
                  </p>
                  <p className="qx-muted">{sosResult.error}</p>
                  <p className="qx-muted" style={{ marginTop: 10, fontSize: 13 }}>
                    Please call the hospital emergency line directly: <strong>0261-XXXXXXX</strong>
                  </p>
                </div>
              )}
            </div>
            <div className="qx-sos-modal-actions">
              {sosStage === "form" && (
                <>
                  <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={closeSos}>
                    Cancel
                  </button>
                  <button className="qx-btn qx-btn-danger qx-btn-sm" onClick={() => setSosStage("countdown")}>
                    🚨 Send Emergency SOS
                  </button>
                </>
              )}
              {sosStage === "countdown" && (
                <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={closeSos}>
                  Cancel Emergency
                </button>
              )}
              {sosStage === "sent" && (
                <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={closeSos}>
                  Close
                </button>
              )}
              {sosStage === "error" && (
                <>
                  <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={() => { setSosStage("form"); setSosResult(null); }}>
                    Retry
                  </button>
                  <button className="qx-btn qx-btn-outline qx-btn-sm" onClick={closeSos}>
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}