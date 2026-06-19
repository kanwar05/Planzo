import { api, TOKEN_KEY, USER_KEY } from "./api";

const saveSession = ({ token, user }) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return { token, user };
};

export const register = async (data) => {
  const response = await api.post("/auth/register", data);
  return saveSession(response.data);
};

export const login = async (data) => {
  const response = await api.post("/auth/login", data);
  return saveSession(response.data);
};

export const getMe = async () => {
  const response = await api.get("/auth/me");
  localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
  return response.data.user;
};

export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};
