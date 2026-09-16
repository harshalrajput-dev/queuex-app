let resetToken = "";

function switchView(view) {
  document.getElementById("viewLogin").classList.toggle("qx-hide", view !== "login");
  document.getElementById("viewRegister").classList.toggle("qx-hide", view !== "register");
  document.getElementById("viewForgot").classList.toggle("qx-hide", view !== "forgot");
  document.getElementById("tabLogin").classList.toggle("qx-btn-outline", view !== "login");
  document.getElementById("tabRegister").classList.toggle("qx-btn-outline", view !== "register");
  hideError("loginError");
  hideError("regError");
}

function hideError(id) {
  document.getElementById(id).classList.add("qx-hide");
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("qx-hide");
}

function toggleShow(inputId, btn) {
  const input = document.getElementById(inputId);
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.textContent = show ? "Hide" : "Show";
}

function updateAge() {
  const age = ageFromDob(document.getElementById("regDob").value);
  document.getElementById("regAge").textContent = age ? `Age: ${age}` : "";
}

function previewPhoto() {
  const input = document.getElementById("regPhoto");
  const preview = document.getElementById("photoPreview");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => { preview.src = e.target.result; };
    reader.readAsDataURL(input.files[0]);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!identifier || !password) {
    showError("loginError", "Email/Mobile and password are required.");
    return;
  }
  const isEmail = identifier.includes("@");
  const body = isEmail ? { email: identifier, password } : { mobile: identifier, password };
  try {
    const res = await api("/auth/login", { method: "POST", body });
    if (!res || !res.token || !res.user) {
      throw new Error("Login response was invalid. Please try again.");
    }
    setSession(res.user, res.token);
    if (document.getElementById("rememberMe").checked) {
      localStorage.setItem("qx_remember", identifier);
    } else {
      localStorage.removeItem("qx_remember");
    }
    toast("Welcome " + res.user.name);
    window.location.href = roleHome(res.user.role);
  } catch (err) {
    showError("loginError", err.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const password = document.getElementById("regPassword").value;
  const confirm = document.getElementById("regConfirm").value;
  if (password !== confirm) {
    showError("regError", "Passwords do not match.");
    return;
  }

  const conditions = [];
  document.querySelectorAll(".cond:checked").forEach((c) => conditions.push(c.value));

  let profilePhoto = "";
  const photoInput = document.getElementById("regPhoto");
  if (photoInput.files && photoInput.files[0]) {
    if (photoInput.files[0].size > 3 * 1024 * 1024) {
      showError("regError", "Photo must be smaller than 3 MB.");
      return;
    }
    profilePhoto = await readAsDataUrl(photoInput.files[0]);
  }

  const extra = [];
  if (document.getElementById("regSmoking").value === "Yes") extra.push("Smoking: Yes");
  if (document.getElementById("regAlcohol").value === "Yes") extra.push("Alcohol: Yes");
  const medication = document.getElementById("regMedication").value.trim();
  if (medication) extra.push("Current medication: " + medication);
  const notes = document.getElementById("regNotes").value.trim();
  if (notes) extra.push(notes);

  const body = {
    name: document.getElementById("regName").value.trim(),
    dob: document.getElementById("regDob").value,
    gender: document.getElementById("regGender").value,
    mobile: document.getElementById("regMobile").value.trim(),
    email: document.getElementById("regEmail").value.trim(),
    bloodGroup: document.getElementById("regBlood").value,
    address: document.getElementById("regAddress").value.trim(),
    city: document.getElementById("regCity").value.trim(),
    emergencyContact: document.getElementById("regEmergency").value.trim(),
    password,
    profilePhoto,
    medicalHistory: {
      bloodPressure: document.getElementById("regBP").value,
      allergies: document.getElementById("regAllergies").value,
      pastSurgeries: document.getElementById("regSurgeries").value,
      preExistingConditions: conditions,
      currentProblem: document.getElementById("regProblem").value.trim(),
      problemDuration: document.getElementById("regDuration").value,
      severity: (document.querySelector('input[name="severity"]:checked') || {}).value || "Mild",
      otherNotes: extra.join(" | ")
    }
  };

  try {
    const res = await api("/auth/register", { method: "POST", body });
    toast(res.message || "Registration successful");
    document.getElementById("loginIdentifier").value = body.email;
    document.getElementById("loginPassword").value = "";
    switchView("login");
  } catch (err) {
    showError("regError", err.message);
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

let fgStage = "identify";

async function stepForgot(e) {
  e.preventDefault();
  hideError("forgotError");
  document.getElementById("forgotInfo").classList.add("qx-hide");
  const identifier = document.getElementById("fgIdentifier").value.trim();
  const isEmail = identifier.includes("@");

  if (fgStage === "identify") {
    try {
      const res = await api("/auth/forgot-password", {
        method: "POST",
        body: isEmail ? { email: identifier } : { mobile: identifier }
      });
      const info = document.getElementById("forgotInfo");
      info.textContent = res.data && res.data.devOtp
        ? `OTP sent (development mode). Your OTP is: ${res.data.devOtp}`
        : res.message;
      info.classList.remove("qx-hide");
      fgStage = "otp";
      setForgotStage(["fgOtpField"]);
      return;
    } catch (err) {
      showError("forgotError", err.message);
      return;
    }
  }

  if (fgStage === "otp") {
    try {
      const res = await api("/auth/verify-otp", {
        method: "POST",
        body: isEmail ? { email: identifier, otp: document.getElementById("fgOtp").value } : { mobile: identifier, otp: document.getElementById("fgOtp").value }
      });
      resetToken = res.data.resetToken;
      fgStage = "password";
      setForgotStage(["fgPassField", "fgConfirmField"]);
      return;
    } catch (err) {
      showError("forgotError", err.message);
      return;
    }
  }

  if (fgStage === "password") {
    const pass = document.getElementById("fgNewPass").value;
    const confirm = document.getElementById("fgNewConfirm").value;
    if (pass !== confirm) {
      showError("forgotError", "Passwords do not match.");
      return;
    }
    try {
      await api("/auth/reset-password-by-otp", {
        method: "POST",
        body: { resetToken, newPassword: pass }
      });
      toast("Password updated. Please login.");
      fgStage = "identify";
      document.getElementById("forgotForm").reset();
      document.getElementById("fgOtpField").classList.add("qx-hide");
      document.getElementById("fgPassField").classList.add("qx-hide");
      document.getElementById("fgConfirmField").classList.add("qx-hide");
      switchView("login");
    } catch (err) {
      showError("forgotError", err.message);
    }
  }
}

function setForgotStage(fieldsToShow) {
  ["fgOtpField", "fgPassField", "fgConfirmField"].forEach((id) => {
    document.getElementById(id).classList.add("qx-hide");
  });
  fieldsToShow.forEach((id) => document.getElementById(id).classList.remove("qx-hide"));
}

document.addEventListener("DOMContentLoaded", () => {
  if (getToken() && getUser()) {
    window.location.href = roleHome(getUser().role);
    return;
  }
  document.getElementById("tabLogin").addEventListener("click", () => switchView("login"));
  document.getElementById("tabRegister").addEventListener("click", () => switchView("register"));
  document.getElementById("toggleLoginShow").addEventListener("click", function () {
    toggleShow("loginPassword", this);
  });
  document.getElementById("forgotLink").addEventListener("click", (e) => {
    e.preventDefault();
    switchView("forgot");
  });
  document.getElementById("regLoginLink").addEventListener("click", (e) => {
    e.preventDefault();
    switchView("login");
  });
  document.getElementById("backToLoginLink").addEventListener("click", (e) => {
    e.preventDefault();
    switchView("login");
  });
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("registerForm").addEventListener("submit", handleRegister);
  document.getElementById("forgotForm").addEventListener("submit", stepForgot);
  document.getElementById("regDob").addEventListener("change", updateAge);
  document.getElementById("regPhoto").addEventListener("change", previewPhoto);

  const remembered = localStorage.getItem("qx_remember");
  if (remembered) {
    document.getElementById("loginIdentifier").value = remembered;
  }
  if (window.location.hash === "#register") {
    switchView("register");
  } else {
    switchView("login");
  }
});
