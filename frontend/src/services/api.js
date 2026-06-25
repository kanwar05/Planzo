import axios from "axios";

export const USER_KEY = "planzo_user";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
  timeout: 10000,
  withCredentials: true,
});

let refreshRequest = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const authUrl = originalRequest?.url || "";
    const isAuthRetryEndpoint =
      authUrl.includes("/auth/login") ||
      authUrl.includes("/auth/register") ||
      authUrl.includes("/auth/refresh") ||
      authUrl.includes("/auth/forgot-password") ||
      authUrl.includes("/auth/reset-password");

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthRetryEndpoint
    ) {
      originalRequest._retry = true;

      try {
        refreshRequest ||= api.post("/auth/refresh", null, {
          _retry: true,
        });
        const response = await refreshRequest;
        localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem(USER_KEY);

        if (!["/login", "/register"].includes(window.location.pathname)) {
          window.location.assign("/login");
        }

        return Promise.reject(refreshError);
      } finally {
        refreshRequest = null;
      }
    }

    return Promise.reject(error);
  },
);
