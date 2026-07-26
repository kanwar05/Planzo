import { api, USER_KEY } from "./api";

export const getSettings = async () =>
  (await api.get("/settings")).data.settings;

export const updateSettings = async (settings) =>
  (await api.patch("/settings", settings)).data.settings;

export const getSessions = async () =>
  (await api.get("/settings/sessions")).data.sessions;

export const revokeSession = async (id) =>
  (await api.delete(`/settings/sessions/${id}`)).data;

export const revokeOtherSessions = async () =>
  (await api.delete("/settings/sessions/others")).data;

export const deactivateAccount = async (password) => {
  const response = await api.post("/settings/deactivate", { password });
  localStorage.removeItem(USER_KEY);
  return response.data;
};

export const deleteAccount = async (password) => {
  const response = await api.delete("/settings/account", { data: { password } });
  localStorage.removeItem(USER_KEY);
  return response.data;
};
