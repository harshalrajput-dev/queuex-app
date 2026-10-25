import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import Footer from "../components/Footer.jsx";
import { api, setSession } from "../api/client.js";
import { ageFromDob, readAsDataUrl } from "../utils/helpers.js";
import { useToast } from "../context/ToastContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState(() => {
    const v = searchParams.get("view");
    if (v === "register") return "register";
    if (v === "forgot") return "forgot";
    return "login";
  });

  useEffect(() => {
    if (user) {
      navigate(user.role === "PATIENT" ? "/patient" : "/assistant", { replace: true });
    }
  }, [user, navigate]);

  /* --- Login state --- */
  const [login, setLogin] = useState({
    identifier: localStorage.getItem("qx_remember") || "",
    password: "",
    showPassword: false,
    remember: false
  });
  const [loginError, setLoginError] = useState("");

  /* --- Register state --- */
  const [reg, setReg] = useState({
    name: "",
    dob: "",
    gender: "",
    mobile: "",
    email: "",
    blood: "Unknown",
    address: "",
    city: "",
    emergency: "",
    password: "",
    confirm: "",
    bp: "Normal",
    allergies: "No",
    surgeries: "No",
    conditions: [],
    smoking: "No",
    alcohol: "No",
    medication: "",
    duration: "Today",
    problem: "",
    severity: "Mild",
    notes: "",
    photo: null,
    photoPreview: ""
  });
  const [regError, setRegError] = useState("");

  /* --- Forgot state --- */
  const [fg, setFg] = useState({ stage: "identify", identifier: "", otp: "", newPass: "", newConfirm: "" });
  const [fgError, setFgError] = useState("");
  const [fgInfo, setFgInfo] = useState("");
  const resetTokenRef = React.useRef("");

  const switchView = (v) => {
    setView(v);
    setLoginError("");
    setRegError("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const identifier = login.identifier.trim();
    if (!identifier || !login.password) {
      setLoginError("Email/Mobile and password are required.");
      return;
    }
    const isEmail = identifier.includes("@");
    const body = isEmail ? { email: identifier, password: login.password } : { mobile: identifier, password: login.password };
    try {
      const res = await api("/auth/login", { method: "POST", body });
      if (!res || !res.token || !res.user) throw new Error("Login response was invalid. Please try again.");
      setSession(res.user, res.token);
      if (login.remember) localStorage.setItem("qx_remember", identifier);
      else localStorage.removeItem("qx_remember");
      toast("Welcome " + res.user.name);
      setUser(res.user);
      navigate(res.user.role === "PATIENT" ? "/patient" : "/assistant");
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const toggleConditions = (value) => {
    setReg((p) => {
      const has = p.conditions.includes(value);
      return { ...p, conditions: has ? p.conditions.filter((c) => c !== value) : [...p.conditions, value] };
    });
  };

  const previewPhoto = async () => {
    if (reg.photo) {
      try {
        const dataUrl = await readAsDataUrl(reg.photo);
        setReg((p) => ({ ...p, photoPreview: dataUrl }));
      } catch (e) {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    if (reg.photo) previewPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg.photo]);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (reg.password !== reg.confirm) {
      setRegError("Passwords do not match.");
      return;
    }
    if (reg.photo && reg.photo.size > 3 * 1024 * 1024) {
      setRegError("Photo must be smaller than 3 MB.");
      return;
    }
    let profilePhoto = "";
    if (reg.photo) {
      try {
        profilePhoto = await readAsDataUrl(reg.photo);
      } catch (err) {
        setRegError("Could not read photo file.");
        return;
      }
    }
    const extra = [];
    if (reg.smoking === "Yes") extra.push("Smoking: Yes");
    if (reg.alcohol === "Yes") extra.push("Alcohol: Yes");
    if (reg.medication.trim()) extra.push("Current medication: " + reg.medication.trim());
    if (reg.notes.trim()) extra.push(reg.notes.trim());

    const body = {
      name: reg.name.trim(),
      dob: reg.dob,
      gender: reg.gender,
      mobile: reg.mobile.trim(),
      email: reg.email.trim(),
      bloodGroup: reg.blood,
      address: reg.address.trim(),
      city: reg.city.trim(),
      emergencyContact: reg.emergency.trim(),
      password: reg.password,
      profilePhoto,
      medicalHistory: {
        bloodPressure: reg.bp,
        allergies: reg.allergies,
        pastSurgeries: reg.surgeries,
        preExistingConditions: reg.conditions,
        currentProblem: reg.problem.trim(),
        problemDuration: reg.duration,
        severity: reg.severity,
        otherNotes: extra.join(" | ")
      }
    };
    try {
      const res = await api("/auth/register", { method: "POST", body });
      toast(res.message || "Registration successful");
      setLogin((p) => ({ ...p, identifier: body.email, password: "" }));
      switchView("login");
    } catch (err) {
      setRegError(err.message);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setFgError("");
    setFgInfo("");
    const identifier = fg.identifier.trim();
    const isEmail = identifier.includes("@");
    const field = isEmail ? { email: identifier } : { mobile: identifier };

    if (fg.stage === "identify") {
      try {
        const res = await api("/auth/forgot-password", { method: "POST", body: field });
        setFgInfo(
          res.data && res.data.devOtp ? `OTP sent (development mode). Your OTP is: ${res.data.devOtp}` : res.message
        );
        setFg((p) => ({ ...p, stage: "otp" }));
      } catch (err) {
        setFgError(err.message);
      }
      return;
    }
    if (fg.stage === "otp") {
      try {
        const res = await api("/auth/verify-otp", {
          method: "POST",
          body: { ...field, otp: fg.otp }
        });
        resetTokenRef.current = res.data && res.data.resetToken;
        setFg((p) => ({ ...p, stage: "password" }));
      } catch (err) {
        setFgError(err.message);
      }
      return;
    }
    if (fg.stage === "password") {
      if (fg.newPass !== fg.newConfirm) {
        setFgError("Passwords do not match.");
        return;
      }
      try {
        await api("/auth/reset-password-by-otp", {
          method: "POST",
          body: { resetToken: resetTokenRef.current, newPassword: fg.newPass }
        });
        toast("Password updated. Please login.");
        setFg({ stage: "identify", identifier: "", otp: "", newPass: "", newConfirm: "" });
        resetTokenRef.current = "";
        switchView("login");
      } catch (err) {
        setFgError(err.message);
      }
    }
  };

  const age = ageFromDob(reg.dob);

  return (
    <div>
      <Topbar
        navLinks={[
          { label: "Home", to: "/" },
          { label: "Doctors", to: "/#doctors", hash: true },
          { label: "Live Queue", to: "/queue" }
        ]}
      >
        <Link to="/staff-login" className="qx-btn qx-btn-sm qx-btn-glass">
          Staff Login
        </Link>
      </Topbar>

      <main className="container">
        <div className="qx-auth-shell">
          <div className="qx-auth-tabs">
            <button className={`qx-btn qx-btn-lg ${view === "login" ? "" : "qx-btn-outline"}`} onClick={() => switchView("login")}>
              Patient Login
            </button>
            <button
              className={`qx-btn qx-btn-lg qx-btn-success ${view === "register" ? "" : "qx-btn-outline"}`}
              onClick={() => switchView("register")}
            >
              New Patient Registration
            </button>
          </div>

          {view === "login" && (
            <div className="qx-auth-card">
              <h3>Patient Secure Login</h3>
              <p className="qx-muted">
                Login with your registered email <strong>or</strong> mobile number.
              </p>
              {loginError && <div className="qx-alert qx-alert-danger">{loginError}</div>}
              <form onSubmit={handleLogin}>
                <div className="qx-field">
                  <label htmlFor="loginIdentifier">Email or Mobile Number</label>
                  <input
                    type="text"
                    id="loginIdentifier"
                    placeholder="patient@gmail.com or 9876543210"
                    required
                    value={login.identifier}
                    onChange={(e) => setLogin((p) => ({ ...p, identifier: e.target.value }))}
                  />
                </div>
                <div className="qx-field">
                  <label htmlFor="loginPassword">Password</label>
                  <div className="qx-flex">
                    <input
                      type={login.showPassword ? "text" : "password"}
                      id="loginPassword"
                      placeholder="Enter password"
                      required
                      style={{ flex: 1 }}
                      value={login.password}
                      onChange={(e) => setLogin((p) => ({ ...p, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="qx-btn qx-btn-outline qx-btn-sm"
                      style={{ flex: "0 0 auto" }}
                      onClick={() => setLogin((p) => ({ ...p, showPassword: !p.showPassword }))}
                    >
                      {login.showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div className="qx-flex qx-wrap" style={{ justifyContent: "space-between" }}>
                  <label className="qx-check">
                    <input
                      type="checkbox"
                      checked={login.remember}
                      onChange={(e) => setLogin((p) => ({ ...p, remember: e.target.checked }))}
                    />{" "}
                    Remember me
                  </label>
                  <a href="#" onClick={(e) => { e.preventDefault(); switchView("forgot"); }}>
                    Forgot password?
                  </a>
                </div>
                <button type="submit" className="qx-btn w100 qx-mt">
                  Login
                </button>
                <p className="qx-muted qx-center qx-mt" style={{ marginBottom: 0 }}>
                  Hospital staff?{" "}
                  <Link to="/staff-login">Login at the Staff Portal</Link>
                </p>
              </form>
            </div>
          )}

          {view === "register" && (
            <div className="qx-auth-card">
              <h3>New Patient Registration</h3>
              <p className="qx-muted">Complete registration from home. A token request is confirmed by the hospital assistant.</p>
              {regError && <div className="qx-alert qx-alert-danger">{regError}</div>}
              <form onSubmit={handleRegister}>
                <div className="qx-grid qx-grid-2">
                  <div className="qx-field">
                    <label htmlFor="regName">Full Name *</label>
                    <input type="text" id="regName" required value={reg.name} onChange={(e) => setReg((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regDob">Date of Birth *</label>
                    <input type="date" id="regDob" required value={reg.dob} onChange={(e) => setReg((p) => ({ ...p, dob: e.target.value }))} />
                    <div className="est-banner">{age ? `Age: ${age}` : ""}</div>
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regGender">Gender *</label>
                    <select id="regGender" required value={reg.gender} onChange={(e) => setReg((p) => ({ ...p, gender: e.target.value }))}>
                      <option value="">Select</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regMobile">Mobile Number *</label>
                    <input type="tel" id="regMobile" required pattern="[0-9]{10}" value={reg.mobile} onChange={(e) => setReg((p) => ({ ...p, mobile: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regEmail">Email *</label>
                    <input type="email" id="regEmail" required value={reg.email} onChange={(e) => setReg((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regBlood">Blood Group</label>
                    <select id="regBlood" value={reg.blood} onChange={(e) => setReg((p) => ({ ...p, blood: e.target.value }))}>
                      <option value="Unknown">Don't Know</option>
                      <option>A+</option>
                      <option>A-</option>
                      <option>B+</option>
                      <option>B-</option>
                      <option>O+</option>
                      <option>O-</option>
                      <option>AB+</option>
                      <option>AB-</option>
                    </select>
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regAddress">Address</label>
                    <input type="text" id="regAddress" placeholder="House, street, area" value={reg.address} onChange={(e) => setReg((p) => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regCity">City</label>
                    <input type="text" id="regCity" placeholder="Surat" value={reg.city} onChange={(e) => setReg((p) => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regEmergency">Emergency Contact</label>
                    <input type="tel" id="regEmergency" placeholder="Family member mobile" value={reg.emergency} onChange={(e) => setReg((p) => ({ ...p, emergency: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regPassword">Password (min 8 chars) *</label>
                    <input type="password" id="regPassword" minLength={8} required value={reg.password} onChange={(e) => setReg((p) => ({ ...p, password: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label htmlFor="regConfirm">Confirm Password *</label>
                    <input type="password" id="regConfirm" minLength={8} required value={reg.confirm} onChange={(e) => setReg((p) => ({ ...p, confirm: e.target.value }))} />
                  </div>
                </div>

                <div className="qx-subcard qx-mt">
                  <h4>Profile Photo (identity)</h4>
                  <div className="qx-flex qx-wrap">
                    <input
                      type="file"
                      accept="image/*"
                      id="regPhoto"
                      style={{ flex: 1, minWidth: 200 }}
                      onChange={(e) => setReg((p) => ({ ...p, photo: e.target.files[0] }))}
                    />
                    <img
                      src={reg.photoPreview || ""}
                      alt="Photo preview"
                      style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--qx-border)" }}
                    />
                  </div>
                </div>

                <div className="qx-subcard qx-mt">
                  <h4>Medical Information (optional but helpful)</h4>
                  <div className="qx-grid qx-grid-2">
                    <div className="qx-field">
                      <label>Blood Pressure</label>
                      <select value={reg.bp} onChange={(e) => setReg((p) => ({ ...p, bp: e.target.value }))}>
                        <option>Normal</option>
                        <option>High BP</option>
                        <option>Low BP</option>
                        <option>None</option>
                      </select>
                    </div>
                    <div className="qx-field">
                      <label>Allergies</label>
                      <select value={reg.allergies} onChange={(e) => setReg((p) => ({ ...p, allergies: e.target.value }))}>
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div className="qx-field">
                      <label>Past Surgeries</label>
                      <select value={reg.surgeries} onChange={(e) => setReg((p) => ({ ...p, surgeries: e.target.value }))}>
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div className="qx-field">
                      <label>Existing Diseases (multi-select)</label>
                      <div>
                        {["Diabetes", "Asthma", "Heart Problem", "Thyroid"].map((c) => (
                          <label key={c} className="qx-check">
                            <input
                              type="checkbox"
                              className="cond"
                              value={c}
                              checked={reg.conditions.includes(c)}
                              onChange={() => toggleConditions(c)}
                            />{" "}
                            {c === "Heart Problem" ? "Heart" : c}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="qx-field">
                      <label>Smoking</label>
                      <select value={reg.smoking} onChange={(e) => setReg((p) => ({ ...p, smoking: e.target.value }))}>
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </div>
                    <div className="qx-field">
                      <label>Alcohol</label>
                      <select value={reg.alcohol} onChange={(e) => setReg((p) => ({ ...p, alcohol: e.target.value }))}>
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </div>
                    <div className="qx-field">
                      <label>Current Medication</label>
                      <input type="text" placeholder="Ongoing medicines, if any" value={reg.medication} onChange={(e) => setReg((p) => ({ ...p, medication: e.target.value }))} />
                    </div>
                    <div className="qx-field">
                      <label>How long is the current problem?</label>
                      <select value={reg.duration} onChange={(e) => setReg((p) => ({ ...p, duration: e.target.value }))}>
                        <option>Today</option>
                        <option>Few Days</option>
                        <option>1 Week</option>
                        <option>1 Month</option>
                        <option>More than 1 Month</option>
                      </select>
                    </div>
                  </div>
                  <div className="qx-field">
                    <label>Main problem / symptom (what brings you to hospital)</label>
                    <input type="text" placeholder="e.g. fever, cough, chest pain" value={reg.problem} onChange={(e) => setReg((p) => ({ ...p, problem: e.target.value }))} />
                  </div>
                  <div className="qx-field">
                    <label>Severity</label>
                    <label className="qx-check">
                      <input type="radio" name="severity" value="Mild" checked={reg.severity === "Mild"} onChange={() => setReg((p) => ({ ...p, severity: "Mild" }))} /> Mild
                    </label>
                    <label className="qx-check">
                      <input type="radio" name="severity" value="Moderate" checked={reg.severity === "Moderate"} onChange={() => setReg((p) => ({ ...p, severity: "Moderate" }))} /> Moderate
                    </label>
                    <label className="qx-check">
                      <input type="radio" name="severity" value="Severe" checked={reg.severity === "Severe"} onChange={() => setReg((p) => ({ ...p, severity: "Severe" }))} /> Severe
                    </label>
                  </div>
                  <div className="qx-field">
                    <label>Other medical notes</label>
                    <textarea rows={2} value={reg.notes} onChange={(e) => setReg((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>

                <button type="submit" className="qx-btn qx-btn-success w100 qx-mt">
                  Register &amp; Proceed to Login
                </button>
                <p className="qx-muted qx-center qx-mt">
                  Already registered?{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); switchView("login"); }}>
                    Login here
                  </a>
                </p>
              </form>
            </div>
          )}

          {view === "forgot" && (
            <div className="qx-auth-card">
              <h3>Forgot Password</h3>
              <p className="qx-muted">
                Enter your registered mobile or email. An OTP will be sent (development mode shows it on screen).
              </p>
              {fgError && <div className="qx-alert qx-alert-danger">{fgError}</div>}
              {fgInfo && <div className="qx-alert qx-alert-success">{fgInfo}</div>}
              <form onSubmit={handleForgot}>
                <div className="qx-field">
                  <label>Registered Mobile or Email</label>
                  <input
                    type="text"
                    required
                    value={fg.identifier}
                    onChange={(e) => setFg((p) => ({ ...p, identifier: e.target.value }))}
                  />
                </div>
                {fg.stage !== "identify" && (
                  <div className="qx-field">
                    <label>OTP</label>
                    <input type="text" required value={fg.otp} onChange={(e) => setFg((p) => ({ ...p, otp: e.target.value }))} />
                  </div>
                )}
                {(fg.stage === "password") && (
                  <>
                    <div className="qx-field">
                      <label>New Password</label>
                      <input type="password" minLength={8} required value={fg.newPass} onChange={(e) => setFg((p) => ({ ...p, newPass: e.target.value }))} />
                    </div>
                    <div className="qx-field">
                      <label>Confirm New Password</label>
                      <input type="password" minLength={8} required value={fg.newConfirm} onChange={(e) => setFg((p) => ({ ...p, newConfirm: e.target.value }))} />
                    </div>
                  </>
                )}
                <button type="submit" className="qx-btn w100">
                  {fg.stage === "identify" ? "Continue" : fg.stage === "otp" ? "Verify OTP" : "Reset Password"}
                </button>
              </form>
              <p className="qx-muted qx-mt">
                <a href="#" onClick={(e) => { e.preventDefault(); switchView("login"); }}>
                  Back to login
                </a>
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}