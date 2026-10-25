import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { api } from "../api/client.js";
import { formatDistance, qrDataURL, statusBadgeClass } from "../utils/helpers.js";
import "../styles/verify-token.css";

const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function VerifyStatusBlock({ data }) {
  if (!data || typeof data.valid !== "boolean") {
    return <div className="qx-verify-msg err">⚠️ Could not verify this token.</div>;
  }
  if (data.valid) {
    return (
      <div className="qx-verify-msg ok">
        ✓ Valid appointment pass — {esc((data.status || "").replace(/_/g, " "))}
      </div>
    );
  }
  return <div className="qx-verify-msg warn">⏳ {esc(data.message)}</div>;
}

export default function VerifyToken() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const sig = searchParams.get("sig") || "";

  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token || !sig) {
        setState({ loading: false, data: null, error: "This QR code is missing required token information." });
        return;
      }
      try {
        const data = await api(`/bookings/verify/${encodeURIComponent(token)}?sig=${encodeURIComponent(sig)}`);
        if (!cancelled) setState({ loading: false, data, error: "" });
      } catch (err) {
        if (!cancelled) setState({ loading: false, data: null, error: err.message || "This token could not be verified." });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, sig]);

  const qr = qrDataURL(window.location.href, 7, 3);

  const renderCard = () => {
    if (state.loading) {
      return (
        <div className="qx-center" style={{ padding: "40px 0" }}>
          <div className="qx-spinner" style={{ margin: "40px auto" }}></div>
          <div className="qx-muted">Verifying token...</div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="qx-verify-card">
          <div className="qx-verify-head">
            <div className="qx-verify-brand">
              <span className="qx-brand-badge">🏥</span>
              <div>
                QueueX<small>New Civil Hospital, Surat</small>
              </div>
            </div>
          </div>
          <div className="qx-verify-body">
            <div className="qx-verify-msg err">⚠️ {esc(state.error)}</div>
            <p className="qx-muted" style={{ margin: 0 }}>
              If you scanned this from a printed pass, please ask the OPD counter for assistance.
            </p>
          </div>
        </div>
      );
    }

    const data = state.data;
    return (
      <div className="qx-verify-card" id="verifyCard">
        <div className="qx-verify-head">
          <div className="qx-verify-brand">
            <span className="qx-brand-badge">🏥</span>
            <div>
              QueueX<small>New Civil Hospital, Surat</small>
            </div>
          </div>
          <div className="qx-verify-token">{esc(data.tokenId)}</div>
        </div>
        <div className="qx-verify-body">
          <VerifyStatusBlock data={data} />
          <div style={{ fontSize: 18, fontWeight: 800 }}>{esc(data.patientName)}</div>
          <div className="qx-muted" style={{ marginBottom: 6 }}>
            {esc(data.address || "")}
          </div>
          <div className="qx-verify-grid">
            <div>
              <span>Doctor</span>
              <b>{esc(data.doctorName)}</b>
            </div>
            <div>
              <span>Department</span>
              <b>{esc(data.doctorDept || "")}</b>
            </div>
            <div>
              <span>Room</span>
              <b>{esc(data.roomNo || "-")}</b>
            </div>
            <div>
              <span>Date</span>
              <b>{esc(data.bookingDate)}</b>
            </div>
            <div>
              <span>Time slot</span>
              <b>{esc(data.slotTime)}</b>
            </div>
            <div>
              <span>Distance</span>
              <b>{data.distanceKm ? formatDistance(data.distanceKm) + " from hospital" : "-"}</b>
            </div>
            {data.primarySymptom ? (
              <div>
                <span>Main symptom</span>
                <b>{esc(data.primarySymptom)}</b>
              </div>
            ) : (
              <div>
                <span>Status</span>
                <b>
                  <span className={`qx-badge ${statusBadgeClass(data.status)}`}>
                    {esc((data.status || "").replace(/_/g, " "))}
                  </span>
                </b>
              </div>
            )}
          </div>
          {qr && (
            <div className="qx-verify-scan">
              <div style={{ textAlign: "center" }}>
                <img
                  src={qr}
                  alt={`QR code for ${esc(data.tokenId)}`}
                  width={128}
                  height={128}
                  style={{ border: "1px solid var(--qx-border)", borderRadius: 12, padding: 6 }}
                />
                <div className="qx-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Scan this QR at the OPD counter
                </div>
              </div>
            </div>
          )}
          <div className="qx-modal-actions qx-print-hide">
            <button className="qx-btn qx-btn-success" onClick={() => window.print()}>
              🖨 Print token pass
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <Topbar
        brandSmall="Token Verification"
        navLinks={[
          { label: "Live Queue", to: "/queue" },
          { label: "Home", to: "/" }
        ]}
      >
        <Link className="qx-btn qx-btn-outline qx-btn-sm" to="/queue">
          Live Queue
        </Link>
        <Link className="qx-btn qx-btn-outline qx-btn-sm" to="/">
          Home
        </Link>
      </Topbar>

      <main className="container">
        <div className="qx-verify-shell" style={{ padding: "28px 0" }}>{renderCard()}</div>
      </main>

      <Footer />
    </div>
  );
}