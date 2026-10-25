import React from "react";
import { Link } from "react-router-dom";

const cols = [
  {
    title: "Quick Links",
    links: [
      { label: "Home", to: "/" },
      { label: "Departments", to: "/#departments" },
      { label: "Our Doctors", to: "/#doctors" },
      { label: "Live Queue Display", to: "/queue" }
    ]
  },
  {
    title: "Patient Support",
    links: [
      { label: "Patient Login", to: "/login" },
      { label: "New Registration", to: "/login?view=register" },
      { label: "Staff Portal", to: "/staff-login" },
      { label: "Forgot Password", to: "/login?view=forgot" }
    ]
  },
  {
    title: "Staff Support",
    links: [
      { label: "Staff Login", to: "/staff-login" },
      { label: "Patient Portal", to: "/login" }
    ]
  }
];

export default function Footer() {
  return (
    <footer className="qx-footer">
      <div className="qx-footer-grid container">
        <div className="qx-footer-col qx-footer-brand">
          <Link className="qx-brand" to="/">
            <span className="qx-brand-badge">🏥</span>
            <span className="qx-brand-text">
              QueueX
              <small>New Civil Hospital, Surat</small>
            </span>
          </Link>
          <p>Prototype for public hospital digital queue management. Not an official government system.</p>
          <span className="qx-chip qx-chip-live">
            <span className="pulse-dot"></span> System online
          </span>
        </div>
        {cols.map((col) => (
          <div key={col.title} className="qx-footer-col">
            <h5>{col.title}</h5>
            {col.links.map((l) => (
              <Link key={l.label} to={l.to}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
        <div className="qx-footer-col">
          <h5>Contact</h5>
          <div>New Civil Hospital, Surat</div>
          <div>Majura Gate, Ring Road, Surat, Gujarat</div>
          <div>OPD: 09:00 AM – 05:00 PM</div>
          <div>Emergency: 24 × 7</div>
        </div>
      </div>
      <div className="qx-footer-bottom">
        <div className="qx-footer-bottom-inner container">
          <span>© 2026 QueueX · Prototype for public hospital digital queue management</span>
          <span>⚠️ Not for emergencies — contact the hospital emergency desk immediately</span>
        </div>
      </div>
    </footer>
  );
}