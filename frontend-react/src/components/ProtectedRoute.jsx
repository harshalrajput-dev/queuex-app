import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  const token = localStorage.getItem("qx_token");

  if (!user || !token) {
    const staffOnly = Array.isArray(roles) && roles.some((r) => r !== "PATIENT");
    return <Navigate to={staffOnly ? "/staff-login" : "/login"} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === "PATIENT" ? "/patient" : "/assistant"} replace />;
  }
  return children;
}