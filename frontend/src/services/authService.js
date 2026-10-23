import { api } from "./api";
export const register = async data => (await api.post("/auth/register", data)).data.user;
export const login = async data => (await api.post("/auth/login", data)).data.user;
export const requestLoginOtp = async email => (await api.post("/auth/login/otp/request", { email })).data;
export const verifyLoginOtp = async data => (await api.post("/auth/login/otp/verify", data)).data.user;
export const refresh = async () => (await api.post("/auth/refresh")).data.user;
export const getMe = async () => (await api.get("/auth/me")).data.user;
export const updateProfile = async data => (await api.patch("/auth/profile", data)).data.user;
export const changePassword = async data => (await api.patch("/auth/password", data)).data;
export const requestEmailChange = async data => (await api.post("/auth/email-change", data)).data;
export const confirmEmailChange = async token => (await api.post("/auth/email-change/confirm", {
  token
})).data;
export const deactivateAccount = async password => (await api.delete("/auth/account", {
  data: {
    password
  }
})).data;
export const logout = async () => (await api.post("/auth/logout")).data;
export const forgotPassword = async email => (await api.post("/auth/forgot-password", {
  email
})).data;
export const resetPassword = async data => (await api.post("/auth/reset-password", data)).data;
