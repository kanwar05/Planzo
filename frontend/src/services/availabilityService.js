import { api } from "./api";
export const getMyAvailability = async () => (await api.get("/vendors/availability")).data;
export const getVendorAvailability = async id => (await api.get(`/vendors/${id}/availability`)).data;
export const updateAvailability = async dates => (await api.put("/vendors/availability", dates)).data.availability;
