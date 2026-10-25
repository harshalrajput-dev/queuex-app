import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getUser,
  setSession,
  clearSession as clearStoredSession
} from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getUser());

  useEffect(() => {
    const stored = getUser();
    setUser(stored);
  }, []);

  const login = (u, token) => {
    setSession(u, token);
    setUser(u);
  };

  const logout = () => {
    clearStoredSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}