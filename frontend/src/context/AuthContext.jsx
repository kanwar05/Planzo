import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authService from "../services/authService";
const AuthContext = createContext(null);
export function AuthProvider({
  children
}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    // Remove the former user cache. Authentication is determined by HTTP-only cookies.
    try {
      localStorage.removeItem("Planzo_user");
    } catch {/* Storage may be disabled. */}
    const expired = () => setUser(null);
    window.addEventListener("planzo:session-expired", expired);
    authService.getMe().then(data => {
      if (active) setUser(data);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      window.removeEventListener("planzo:session-expired", expired);
    };
  }, []);
  const login = useCallback(async credentials => {
    const next = await authService.login(credentials);
    setUser(next);
    return next;
  }, []);
  const register = useCallback(async data => {
    const next = await authService.register(data);
    setUser(next);
    return next;
  }, []);
  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);
  const updateUser = useCallback(next => setUser(next), []);
  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    updateUser
  }), [user, loading, login, register, logout, updateUser]);
  return <AuthContext.Provider value={value}>
    {children}
  </AuthContext.Provider>;
}
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
};
