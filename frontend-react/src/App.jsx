import React from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import AssistantLogin from "./pages/AssistantLogin.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";
import AssistantDesk from "./pages/AssistantDesk.jsx";
import QueueDisplay from "./pages/QueueDisplay.jsx";
import VerifyToken from "./pages/VerifyToken.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/assistant-login" element={<AssistantLogin />} />
      <Route path="/staff-login" element={<AssistantLogin />} />
      <Route
        path="/patient"
        element={
          <ProtectedRoute roles={["PATIENT"]}>
            <PatientDashboard />
          </ProtectedRoute>
        }
        
      />
      <Route
        path="/assistant"
        element={
          <ProtectedRoute roles={["ASSISTANT", "SUPER_ADMIN", "DOCTOR_ADMIN"]}>
            <AssistantDesk />
          </ProtectedRoute>
        }
      />
      <Route path="/queue" element={<QueueDisplay />} />
      <Route path="/queue-display" element={<QueueDisplay />} />
      <Route path="/verify-token" element={<VerifyToken />} />
      <Route
        path="*"
        element={
          <div className="qx-container" style={{ padding: 40 }}>
            <div className="qx-center qx-muted">Page not found.</div>
          </div>
        }
      />
    </Routes>
  );
}