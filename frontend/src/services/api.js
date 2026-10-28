import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
  timeout: 10000,
  withCredentials: true
});
let refreshRequest = null;
api.interceptors.response.use(response => response, async error => {
  const original = error.config;
  const url = original?.url || "";
  const canRefresh = error.response?.data?.code !== "PHONE_AUTH_FAILED" && !["/auth/login", "/auth/login/otp", "/auth/register", "/auth/refresh", "/auth/logout", "/auth/forgot-password", "/auth/reset-password", "/auth/email-change/confirm"].some(path => url.includes(path));
  if (error.response?.status === 401 && original && !original._retry && canRefresh) {
    original._retry = true;
    try {
      refreshRequest ||= api.post("/auth/refresh", null, {
        _retry: true
      });
      await refreshRequest;
      return api(original);
    } catch (refreshError) {
      window.dispatchEvent(new Event("planzo:session-expired"));
      return Promise.reject(refreshError);
    } finally {
      refreshRequest = null;
    }
  }
  return Promise.reject(error);
});
