import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { DoctorAvatar } from "../components/Badges.jsx";
import { api } from "../api/client.js";

const DEPT_ICONS = ["🫀", "🧠", "🦴", "👁️", "🦷", "🩺", "🧸", "🧴", "👂", "🌸", "🏥", "⚕️"];

const SERVICES = [
  { ico: "🚑", num: "24x7", lbl: "Emergency" },
  { ico: "🩺", num: "OPD", lbl: "Outpatient Dept." },
  { ico: "🧪", num: "Lab", lbl: "Laboratory" },
  { ico: "🩻", num: "X-Ray", lbl: "Radiology" },
  { ico: "💊", num: "24x7", lbl: "Pharmacy" },
  { ico: "🩸", num: "Bank", lbl: "Blood Bank" },
  { ico: "📋", num: "Desk", lbl: "Registration" },
  { ico: "❓", num: "Help", lbl: "Help Desk" }
];

function DoctorCard({ doc }) {
  const unavailable = doc.status && doc.status !== "AVAILABLE";
  return (
    <div className="qx-card qx-doc-card">
      <div className="qx-doc-top">
        <DoctorAvatar doctor={doc} />
        <div>
          <h4 className="qx-doc-name">{doc.name}</h4>
          <div className="qx-doc-dept">{doc.department || "General Medicine"}</div>
        </div>
      </div>
      <div className="qx-doc-spec">{doc.specialization || doc.qualification || "Consultant Specialist"}</div>
      <div className="qx-doc-meta">
        <span>
          🚪 Room <b>{doc.room || "-"}</b>
        </span>
        <span>
          🕘 <b>{(doc.opdSlots || []).join(", ") || doc.opdTime || "OPD"}</b>
        </span>
      </div>
      <div className="qx-doc-footer">
        {unavailable ? (
          <span className="qx-badge rejected">{doc.status.replace(/_/g, " ")}</span>
        ) : (
          <span className="qx-badge confirmed">● Available Now</span>
        )}
        <Link to="/login" className="qx-btn qx-btn-sm qx-doc-action">
          Consult
        </Link>
      </div>
    </div>
  );
}

function DepartmentCard({ d, index }) {
  return (
    <div className="qx-card qx-dept-card">
      <div className="qx-dept-ico">{DEPT_ICONS[index % DEPT_ICONS.length]}</div>
      <h4>{d.name}</h4>
      <p className="qx-muted">{d.description || "Specialized department with dedicated OPD services."}</p>
      <div className="qx-doc-meta">
        <span>
          🕘 OPD: <b>{d.opdTiming || "09:00 AM - 05:00 PM"}</b>
        </span>
        <span>🚪 {d.room || "OPD Block"}</span>
      </div>
      <div className="qx-mt" style={{ marginTop: "auto" }}>
        {(d.services || [])
          .slice(0, 4)
          .map((s) => (
            <span key={s} className="qx-dept-chip">
              {s}
            </span>
          ))}
      </div>
      <div className="qx-doc-footer">
        <span className="qx-badge confirmed">{(d.availableDays || []).join(", ") || "Mon - Sat"}</span>
        <Link to="/login?view=register" className="qx-btn qx-btn-sm qx-btn-success">
          Book Token
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const [serverStatus, setServerStatus] = useState("Checking server status...");
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [depError, setDepError] = useState("");
  const [docError, setDocError] = useState("");
  const [query, setQuery] = useState("");
  const initialLoadRef = useRef(false);

  const checkHealth = useCallback(async () => {
    try {
      const res = await api("/health");
      const db = res.data && res.data.database;
      setServerStatus(`Server: ${res.data.server} | Database: ${db}`);
    } catch (err) {
      setServerStatus("Server unavailable");
    }
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    checkHealth();
    api("/departments")
      .then((res) => setDepartments(res.data || []))
      .catch((err) => setDepError(err.message));
    api("/doctors")
      .then((res) => setDoctors(res.data || []))
      .catch((err) => setDocError(err.message));
  }, [checkHealth]);

  const filteredDoctors = doctors.filter((doc) => {
    if (!query) return true;
    const hay = `${doc.name} ${doc.department} ${doc.specialization}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <div>
      <Topbar
        navLinks={[
          { label: "Departments", to: "#departments", hash: true },
          { label: "Doctors", to: "#doctors", hash: true },
          { label: "Services", to: "#services", hash: true },
          { label: "Live Queue", to: "/queue" }
        ]}
      >
        <Link to="/login" className="qx-btn qx-btn-sm qx-btn-outline">
          Patient Login
        </Link>
        <Link to="/login?view=register" className="qx-btn qx-btn-sm qx-btn-success">
          Register
        </Link>
        <Link to="/staff-login" className="qx-btn qx-btn-sm qx-btn-glass">
          Staff Login
        </Link>
      </Topbar>

      <main className="container">
        <section className="qx-hero">
          <div className="qx-hero-inner">
            <div className="qx-hero-copy">
              <div className="qx-chip-row">
                <span className="qx-chip">🏥 Government-hospital-inspired workflow</span>
                <span className="qx-chip qx-chip-live">
                  <span className="pulse-dot"></span> Live Queue Active
                </span>
              </div>
              <h1>
                Smart hospital queues,
                <br />
                <span className="grad">from the comfort of home.</span>
              </h1>
              <p>
                Register, request a token and track your position in the queue — all online. Visit the hospital only
                after your token is confirmed.
              </p>
              <div className="qx-alert qx-alert-danger" role="alert">
                <strong>⚠️ Emergency warning:</strong> This online token system is NOT for emergency treatment. Please
                contact the hospital emergency department immediately.
              </div>
              <div className="qx-flex qx-wrap qx-mt">
                <Link className="qx-btn qx-btn-lg" to="/login">
                  Book Token
                </Link>
                <a className="qx-btn qx-btn-lg qx-btn-glass" href="#doctors">
                  View Doctors
                </a>
                <a className="qx-btn qx-btn-lg qx-btn-glass" href="#departments">
                  View Departments
                </a>
                <Link className="qx-btn qx-btn-lg qx-btn-warning" to="/queue">
                  Live Queue Display
                </Link>
              </div>
            </div>

            <div className="qx-hero-visual">
              <div className="qx-mock3d">
                <div className="qx-glow-ring"></div>
                <div className="qx-mock-window">
                  <div className="qx-mock-bar">
                    <span className="qx-dot r"></span>
                    <span className="qx-dot y"></span>
                    <span className="qx-dot g"></span>
                    <span className="qx-mock-title">QueueX · Live Queue Monitor</span>
                  </div>
                  <div className="qx-mock-body">
                    <div className="qx-mock-serving">
                      <div className="qx-mock-label">Now Serving</div>
                      <div className="qx-mock-token">QX-3258</div>
                    </div>
                    <div className="qx-mock-row">
                      <div className="qx-mock-cell">
                        <div className="qx-mock-label">Next</div>
                        <div className="qx-mock-next">QX-3259</div>
                      </div>
                      <div className="qx-mock-cell">
                        <div className="qx-mock-label">Est. Wait</div>
                        <div className="qx-mock-wait">25 min</div>
                      </div>
                    </div>
                    <div className="qx-mock-chart">
                      <span style={{ height: "34%" }}></span>
                      <span style={{ height: "52%" }}></span>
                      <span style={{ height: "40%" }}></span>
                      <span style={{ height: "68%" }}></span>
                      <span style={{ height: "56%" }}></span>
                      <span style={{ height: "82%" }}></span>
                      <span style={{ height: "62%" }}></span>
                      <span style={{ height: "44%" }}></span>
                    </div>
                    <div className="qx-mock-stats">
                      <div className="qx-mock-stat">
                        <b>12</b>
                        <span>Waiting</span>
                      </div>
                      <div className="qx-mock-stat">
                        <b>6</b>
                        <span>Doctors</span>
                      </div>
                      <div className="qx-mock-stat">
                        <b>38</b>
                        <span>Completed</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="qx-float qx-float-1">
                  <span className="tick">✔</span> Token Confirmed
                </div>
                <div className="qx-float qx-float-2">
                  <span className="clock-ico">⏱</span> Est. wait 25 min
                </div>
                <div className="qx-float qx-float-3">
                  <span className="bell-ico">🔔</span> Turn Approaching
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="opd-info" className="qx-panel qx-mb">
          <div className="qx-flex qx-wrap" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>OPD Timings &amp; Information</h3>
            <div
              id="serverStatus"
              className="est-banner"
              style={{ margin: 0, color: serverStatus.includes("connected") ? "var(--qx-green)" : "var(--qx-red)" }}
            >
              {serverStatus}
            </div>
          </div>
          <p className="qx-muted" style={{ marginTop: 12 }}>
            Outpatient Department (OPD) is open from <strong>09:00 AM</strong> to <strong>05:00 PM</strong> (Monday to
            Saturday).
          </p>
          <p className="qx-muted">
            Emergency department operates 24 hours. For emergencies, do not use this portal - call the emergency desk
            or visit the hospital immediately.
          </p>
        </section>

        <section id="departments" className="qx-section">
          <div className="qx-section-head">
            <div>
              <h2>Departments</h2>
              <p className="qx-section-sub">Specialized OPD departments with live schedules.</p>
            </div>
          </div>
          {depError ? (
            <div className="qx-alert qx-alert-danger">Unable to load departments. {depError}</div>
          ) : departments.length ? (
            <div className="qx-grid qx-grid-3">
              {departments.map((d, i) => (
                <DepartmentCard key={d._id || d.name} d={d} index={i} />
              ))}
            </div>
          ) : (
            <div className="qx-alert qx-alert-info">Loading departments...</div>
          )}
        </section>

        <section id="doctors" className="qx-section">
          <div className="qx-section-head">
            <div>
              <h2>Our Medical Experts</h2>
              <p className="qx-section-sub">Meet the specialists, check live availability and book a consultation.</p>
            </div>
            <div className="qx-search" style={{ flex: "0 1 320px", minWidth: 240 }}>
              <input
                type="search"
                placeholder="Search doctor, department or specialty..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {docError ? (
            <div className="qx-alert qx-alert-danger">Unable to load doctors. {docError}</div>
          ) : filteredDoctors.length ? (
            <div className="qx-grid qx-grid-3">
              {filteredDoctors.map((doc) => (
                <DoctorCard key={doc._id} doc={doc} />
              ))}
            </div>
          ) : (
            <div className="qx-alert qx-alert-info">
              {doctors.length ? "No doctors match your search." : "Loading doctors..."}
            </div>
          )}
        </section>

        <section id="services" className="qx-section">
          <div className="qx-section-head">
            <div>
              <h2>Hospital Services</h2>
              <p className="qx-section-sub">Round-the-clock services available at the hospital.</p>
            </div>
          </div>
          <div className="qx-grid qx-grid-4">
            {SERVICES.map((s) => (
              <div key={s.lbl} className="qx-stat">
                <div className="ico">{s.ico}</div>
                <div className="num">{s.num}</div>
                <div className="lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="qx-panel qx-mb">
          <h3>Contact &amp; Address</h3>
          <p>
            <strong>New Civil Hospital, Surat</strong>
            <br />
            Majura Gate, Ring Road, Surat, Gujarat (prototype reference - verify with hospital).
          </p>
          <p className="qx-muted">Working hours: 09:00 AM - 05:00 PM | Emergency: 24 hours</p>
          <div className="qx-flex qx-wrap qx-mt">
            <span className="qx-chip">📞 Emergency: 24 × 7</span>
            <span className="qx-chip">🕘 OPD: Mon – Sat</span>
            <span className="qx-chip">📍 Majura Gate, Surat</span>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}