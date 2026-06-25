import { api, USER_KEY } from "./api";

const saveUser = (user) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
};

export const register = async (data) => {
  const response = await api.post("/auth/register", data);
  return saveUser(response.data.user);
};

export const login = async (data) => {
  const response = await api.post("/auth/login", data);
  return saveUser(response.data.user);
};

export const refresh = async () => {
  const response = await api.post("/auth/refresh");
  return saveUser(response.data.user);
};

export const getMe = async () => {
  const response = await api.get("/auth/me");
  return saveUser(response.data.user);
};

export const logout = async () => {
  try {
    await api.post("/auth/logout");
  } finally {
    localStorage.removeItem(USER_KEY);
  }
};

export const forgotPassword = async (email) => {
  const response = await api.post("/auth/forgot-password", { email });
  return response.data;
};

export const resetPassword = async ({ token, password }) => {
  const response = await api.post("/auth/reset-password", { token, password });
  return response.data;
};

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};
