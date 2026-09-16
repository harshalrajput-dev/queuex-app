function showStaffError(msg) {
  const el = document.getElementById("staffError");
  el.textContent = msg;
  el.classList.remove("qx-hide");
}

async function handleStaffLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById("staffIdentifier").value.trim();
  const password = document.getElementById("staffPassword").value;
  if (!identifier || !password) {
    showStaffError("Email/Mobile and password are required.");
    return;
  }
  const isEmail = identifier.includes("@");
  const body = isEmail ? { email: identifier, password } : { mobile: identifier, password };
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && data.message) || `Login failed (${res.status}). Please try again.`);
    }
    if (!data || !data.token || !data.user) {
      throw new Error("Login response was invalid. Please try again.");
    }
    setSession(data.user, data.token);
    toast("Welcome " + data.user.name);
    window.location.href = data.user.role === "PATIENT" ? "patient-dashboard.html" : "assistant-desk.html";
  } catch (err) {
    showStaffError(err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const user = getUser();
  if (getToken() && user) {
    window.location.href = user.role === "PATIENT" ? "patient-dashboard.html" : "assistant-desk.html";
    return;
  }
  document.getElementById("staffLoginForm").addEventListener("submit", handleStaffLogin);
  document.getElementById("toggleStaffShow").addEventListener("click", function () {
    const input = document.getElementById("staffPassword");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
  });
});
