import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";

export default function AssistantLogin() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && localStorage.getItem("qx_token")) {
      navigate(user.role === "PATIENT" ? "/patient" : "/assistant", { replace: true });
    }
  }, [user, navigate]);

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Email/Mobile and password are required.");
      return;
    }
    const isEmail = identifier.includes("@");
    const body = isEmail ? { email: identifier, password } : { mobile: identifier, password };
    try {
      const res = await api("/auth/login", { method: "POST", body });
      if (!res || !res.token || !res.user) throw new Error("Login response was invalid. Please try again.");
      login(res.user, res.token);
      toast("Welcome " + res.user.name);
      navigate(res.user.role === "PATIENT" ? "/patient" : "/assistant");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <Topbar
        brandSmall="Hospital Staff Portal"
        navLinks={[
          { label: "Home", to: "/" },
          { label: "Live Queue", to: "/queue" },
          { label: "Patient Login", to: "/login" }
        ]}
      />

      <main className="container" style={{ maxWidth: 520 }}>
        <div className="qx-auth-card" style={{ marginTop: 44 }}>
          <div className="qx-center qx-mb">
            <div className="qx-brand-badge" style={{ width: 64, height: 64, fontSize: 30, margin: "0 auto" }}>
              🔐
            </div>
            <h3 style={{ marginTop: 14 }}>Assistant Control Desk</h3>
            <p className="qx-muted" style={{ marginBottom: 0 }}>
              Staff-only login for the hospital assistant control desk (assistant, doctor &amp; admin accounts).
            </p>
          </div>
          {error && <div className="qx-alert qx-alert-danger">{error}</div>}
          <form onSubmit={handleStaffLogin}>
            <div className="qx-field">
              <label htmlFor="staffIdentifier">Email or Mobile Number</label>
              <input
                type="text"
                id="staffIdentifier"
                placeholder="assistant@queueex.test or 9999999901"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div className="qx-field">
              <label htmlFor="staffPassword">Password</label>
              <div className="qx-flex">
                <input
                  type={showPassword ? "text" : "password"}
                  id="staffPassword"
                  placeholder="Enter password"
                  required
                  style={{ flex: 1 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="qx-btn qx-btn-outline qx-btn-sm"
                  style={{ flex: "0 0 auto" }}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button type="submit" className="qx-btn qx-btn-success w100 qx-mt">
              Login to Assistant Desk
            </button>
          </form>
          <p className="qx-muted qx-center qx-mt">
            Patient account? <Link to="/login">Use the Patient Login</Link>
          </p>
          <div className="qx-subcard qx-mt" style={{ textAlign: "center" }}>
            <span className="est-banner" style={{ margin: 0 }}>
              Dev test account: <strong>assistant@queueex.test</strong> / Assistant@123
            </span>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}