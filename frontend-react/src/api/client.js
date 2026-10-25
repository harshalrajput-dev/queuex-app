// All API requests are pointed at the XAMPP PHP backend.
//const API_BASE = "http://localhost/queuex-backend";

const API_BASE = "http://localhost:5000/api";

export function getToken() {
  return localStorage.getItem("qx_token") || "";
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("qx_user") || "null");
  } catch (e) {
    return null;
  }
}

export function setSession(user, token) {
  if (!user || !token) return;
  localStorage.setItem("qx_user", JSON.stringify(user));
  localStorage.setItem("qx_token", token);
}

export function clearSession() {
  localStorage.removeItem("qx_user");
  localStorage.removeItem("qx_token");
}

export function rolePath(role) {
  return role === "PATIENT" ? "/patient" : "/assistant";
}

export function roleLoginPath(role) {
  return role === "PATIENT" ? "/login" : "/staff-login";
}

export async function api(path, options = {}) {
  const { method = "GET", body, auth = false } = options;
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status}). Please try again.`;
    throw new Error(message);
  }
  return data;
}

export { API_BASE };