import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Topbar({ brandSmall = "New Civil Hospital, Surat · Digital Queue", navLinks = [], children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const hash = location.hash;

  useEffect(() => {
    if (path === "/" && hash) {
      const id = hash.replace("#", "");
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 80);
    } else if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash.replace("#", ""));
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 80);
    }
  }, [path, hash]);

  const handleHashClick = (e, to) => {
    e.preventDefault();
    if (path === "/") {
      if (hash === to) {
        const el = document.getElementById(to.replace("#", ""));
        if (el) el.scrollIntoView({ behavior: "smooth" });
      } else {
        window.location.hash = to;
      }
    } else {
      navigate(to);
    }
  };

  return (
    <header className="qx-topbar">
      <div className="qx-topbar-inner">
        <Link className="qx-brand" to="/">
          <span className="qx-brand-badge">🏥</span>
          <span className="qx-brand-text">
            QueueX
            <small>{brandSmall}</small>
          </span>
        </Link>
        <div className="spacer"></div>
        {navLinks.length > 0 && (
          <nav className="qx-nav">
            {navLinks.map((link) =>
              link.hash ? (
                <a key={link.label} href={link.to} onClick={(e) => handleHashClick(e, link.to)}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} to={link.to}>
                  {link.label}
                </Link>
              )
            )}
          </nav>
        )}
        {children && <div className="qx-nav-actions">{children}</div>}
      </div>
    </header>
  );
}