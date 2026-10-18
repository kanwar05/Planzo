import { api } from "./api";
export const getVendors = async (filters = {}, options = {}) => (await api.get("/vendors", {
  params: filters,
  signal: options.signal
})).data;
export const getVendorById = async id => (await api.get(`/vendors/${id}`)).data.vendor;
export const getMyVendorProfile = async () => (await api.get("/vendors/me")).data.vendor;
export const createVendorProfile = async data => (await api.post("/vendors/profile", data)).data.vendor;
export const updateVendorProfile = async data => (await api.patch("/vendors/profile", data)).data.vendor;
