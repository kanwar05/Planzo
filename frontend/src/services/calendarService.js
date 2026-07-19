import { api } from "./api";

export const getCalendarStatus = async () =>
  (await api.get("/calendar/status")).data;

export const connectGoogleCalendar = async () => {
  const { authorizationUrl } = (
    await api.post("/calendar/google/connect")
  ).data;
  window.location.assign(authorizationUrl);
};

export const syncGoogleCalendar = async () =>
  (await api.post("/calendar/sync")).data;

export const disconnectGoogleCalendar = async () =>
  (await api.delete("/calendar/connection")).data;

export const exportCalendar = async () => {
  const response = await api.get("/calendar/export", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "planzo-bookings.ics";
  anchor.click();
  URL.revokeObjectURL(url);
};
