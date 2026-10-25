import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api/client.js";
import "../styles/queue-display.css";

const QUEUED = ["CONFIRMED", "PATIENT_ARRIVED"];
const AVAILABLE = (s) => !s || s === "AVAILABLE";

function StatusBadge({ status }) {
  const available = AVAILABLE(status);
  return <span className={available ? "badge-avail" : "badge-unavail"}>{available ? "● Available" : (status || "OFF").replace(/_/g, " ")}</span>;
}

export default function QueueDisplay() {
  const [board, setBoard] = useState([]);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("");
  const [ward, setWard] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshRef = React.useRef(null);

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/queue-display`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load queue");
      setBoard(Array.isArray(json.data) ? json.data : []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/wards/summary`);
      const json = await res.json();
      if (res.ok) setWard(json.data || json);
    } catch (err) {
      setWard(null);
    }
  }, []);

  refreshRef.current = loadBoard;

  useEffect(() => {
    loadBoard();
    loadWard();
    const timer = setInterval(() => refreshRef.current && refreshRef.current(), 10000);
    return () => clearInterval(timer);
  }, [loadBoard, loadWard]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN", { hour12: false }));
    tick();
    const clockTimer = setInterval(tick, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    if (typeof window.EventSource === "undefined") return undefined;
    const es = new EventSource(`${API_BASE}/queue-display/events`);
    es.addEventListener("board.updated", () => refreshRef.current && refreshRef.current());
    es.addEventListener("ward.updated", () => loadWard());
    es.onerror = () => {};
    return () => es.close();
  }, [loadWard]);

  const departments = useMemo(() => {
    const list = board.map((d) => ({
      ...d,
      waiting: (d.doctors || []).reduce((sum, dr) => sum + (dr.waiting || 0), 0),
      nowServing: (d.doctors || []).find((dr) => dr.nowServing)?.nowServing || null,
      next: (d.doctors || []).map((dr) => dr.next).filter(Boolean)[0] || null
    }));
    return list;
  }, [board]);

  const activeDepartments = departments.filter((d) => d.doctors && d.doctors.length > 0);

  return (
    <div className="qx-queue-display">
      <div className="board-header">
        <div className="qx-flex" style={{ justifyContent: "space-between", maxWidth: 1240, margin: "0 auto" }}>
          <div style={{ textAlign: "left" }}>
            <div className="qx-flex">
              <span className="qx-brand-badge" style={{ width: 52, height: 52, fontSize: 26 }}>
                🏥
              </span>
              <div>
                <h1>New Civil Hospital, Surat</h1>
                <div className="sub">Live Queue Display · Tokens only · No patient names</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="clock" id="clock">
              {clock || "--:--:--"}
            </div>
            <div className="sub">Live · Real-time updates</div>
          </div>
        </div>
      </div>

      <main className="container">
        {ward && (
          <div className="qx-ward-bar" style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 22px 0" }}>
            <div className="qx-ward-bar-inner">
              <div className="qx-ward-bar-header">
                <span>🛏️ Live Ward &amp; Bed Occupancy</span>
                <div className="qx-ward-bar-stats">
                  <span className="qx-ward-stat">Total: {ward.totalBeds ?? "--"}</span>
                  <span className="qx-ward-stat qx-ward-stat-green">Available: {ward.availableBeds ?? "--"}</span>
                  <span className="qx-ward-stat qx-ward-stat-red">Occupied: {ward.occupiedBeds ?? "--"}</span>
                  <span className="qx-ward-stat qx-ward-stat-yellow">Occupancy: {ward.occupancyRate ?? "--"}%</span>
                </div>
              </div>
              <div className="qx-ward-cards">
                {(ward.wards || []).map((w) => {
                  const pct = w.totalBeds > 0 ? Math.round((w.occupiedBeds / w.totalBeds) * 100) : 0;
                  const statusColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
                  return (
                    <div className="qx-ward-card" key={w._id || w.name}>
                      <div className="qx-ward-card-title">{w.name}</div>
                      <div className="qx-ward-card-bedcount">{w.availableBeds} / {w.totalBeds} beds available</div>
                      <div className="qx-ward-progress-bar">
                        <div className="qx-ward-progress-fill" style={{ width: `${pct}%`, background: statusColor }}></div>
                      </div>
                      <div className="qx-ward-card-pct" style={{ color: statusColor }}>{pct}% occupied</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div id="queueBoard" className="qx-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, padding: "22px 0" }}>
          {loading && (
            <div className="qx-center">
              <div className="qx-spinner" style={{ margin: "30px auto" }}></div>
            </div>
          )}
          {!loading && error && <div className="dept-card qx-center">{error}</div>}
          {!loading && !error && activeDepartments.length === 0 && (
            <div className="dept-card qx-center">No queue data available.</div>
          )}
          {!loading && !error &&
            activeDepartments.map((dept) => (
              <div className="dept-card" key={dept.departmentId || dept.department}>
                <div className="dept-title">{dept.department}</div>
                {dept.doctors.map((doc) => (
                  <div className="bd-doc-row" key={doc.doctorId || doc.doctor}>
                    <div className="bd-doc-name">
                      <span>{doc.doctor}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div className="label">Now Serving</div>
                    <div className="serving">{doc.nowServing || "—"}</div>
                    <div className="label">Next</div>
                    <div className="next-token">{doc.next || "—"}</div>
                    <div className="meta qx-mt">
                      Waiting: <strong>{doc.waiting || 0}</strong>
                      {typeof doc.estimatedWaitMinutes === "number" && (
                        <>
                          {" "}
                          · ~<strong>{doc.estimatedWaitMinutes} min</strong>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
        <div style={{ textAlign: "center", paddingBottom: 24 }}>
          <Link to="/" style={{ color: "#94a9cd" }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}