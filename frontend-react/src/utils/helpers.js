import { API_BASE, getToken } from "../api/client.js";

export function ageFromDob(dobValue) {
  if (!dobValue) return "";
  const dob = new Date(dobValue);
  if (isNaN(dob.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age > 0 ? `${age} years` : "0 years";
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN");
}

export function formatDistance(km) {
  return typeof km === "number" && isFinite(km) && km > 0 ? km.toFixed(1) + " km" : "—";
}

export const STATUS_BADGES = {
  PENDING_ASSISTANT: ["pending", "Waiting for confirmation"],
  CONFIRMED: ["confirmed", "Token confirmed"],
  PATIENT_ARRIVED: ["arrived", "Patient arrived"],
  IN_TREATMENT: ["in-treatment", "Treatment in progress"],
  COMPLETED: ["completed", "Treatment completed"],
  ADMITTED: ["admitted", "Patient admitted"],
  REJECTED: ["rejected", "Rejected"],
  CANCELLED: ["cancelled", "Cancelled"],
  NO_SHOW: ["no-show", "No show"]
};

export function statusBadgeClass(status) {
  const s = (status || "").toUpperCase();
  const map = {
    PENDING_ASSISTANT: "pending",
    CONFIRMED: "confirmed",
    PATIENT_ARRIVED: "arrived",
    IN_TREATMENT: "in-treatment",
    COMPLETED: "completed",
    ADMITTED: "admitted",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
    NO_SHOW: "no-show"
  };
  return map[s] || "neutral";
}

export function statusLabel(status) {
  const s = (status || "").toUpperCase();
  const map = {
    PENDING_ASSISTANT: "Waiting for confirmation",
    CONFIRMED: "Token confirmed",
    PATIENT_ARRIVED: "Patient arrived",
    IN_TREATMENT: "Treatment in progress",
    COMPLETED: "Treatment completed",
    ADMITTED: "Patient admitted",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
    NO_SHOW: "No show"
  };
  return map[s] || s.replace(/_/g, " ");
}

export function phpStatusBadgeClass(status) {
  const s = ((status || "Waiting") + "").toLowerCase();
  const map = {
    waiting: "pending",
    "now serving": "in-treatment",
    processing: "in-treatment",
    completed: "completed",
    cancelled: "cancelled"
  };
  return map[s] || "neutral";
}

export function phpStatusLabel(status) {
  const s = ((status || "Waiting") + "").toLowerCase();
  const map = {
    waiting: "Waiting",
    "now serving": "Now Serving",
    processing: "Processing",
    completed: "Completed",
    cancelled: "Cancelled"
  };
  return map[s] || s.replace(/_/g, " ");
}

export function qrDataURL(text, cellSize = 6, margin = 2) {
  if (typeof window.qrcode !== "function") return "";
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(String(text), "Byte");
    qr.make();
    return qr.createDataURL(cellSize, margin);
  } catch (e) {
    return "";
  }
}

export function verifyTokenURL(tokenId, qrSignature) {
  return `${window.location.protocol}//${window.location.host}/verify-token?token=${encodeURIComponent(
    tokenId
  )}&sig=${encodeURIComponent(qrSignature || "")}`;
}

export function speakText(text) {
  if (!window.speechSynthesis) return;
  try {
    const msg = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(msg);
  } catch (e) {
    /* ignore */
  }
}

export function playEmergencyBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, startDelay, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + duration);
    };
    playTone(880, 0, 0.2);
    playTone(1100, 0.22, 0.2);
    playTone(880, 0.44, 0.2);
    playTone(1100, 0.66, 0.2);
  } catch (e) {
    /* silent */
  }
}

export function playSosBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1100, ctx.currentTime);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.3);
    }, 150);
  } catch (e) {
    /* silent */
  }
}

export function downloadBlobPdf(fileName, url, auth = false) {
  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { headers })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to download pass");
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        try {
          document.body.removeChild(a);
        } catch (e) {
          /* silent */
        }
      }, 100);
      return true;
    });
}

export function emergencyPassPdfUrl(alertId) {
  return `${API_BASE}/emergency/${alertId}/pass`;
}

export function walkinPassPdfUrl(tokenId) {
  return `${API_BASE}/assistant/walkin-pass/${encodeURIComponent(tokenId)}/pdf`;
}

export function doctorPhotoUrl(doc) {
  const photo = doc && doc.photo && String(doc.photo).trim() ? String(doc.photo).trim() : "";
  if (!photo) return "/img/staff-default.svg";
  return photo;
}

export function printHtmlString(body) {
  const win = window.open("", "_blank", "width=520,height=760");
  if (!win) return null;
  win.document.open();
  win.document.write(body);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
  return win;
}

export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}